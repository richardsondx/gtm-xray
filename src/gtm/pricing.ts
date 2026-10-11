/**
 * pricing.ts: reads /pricing (and friends) to recover plan names, monthly
 * and annual prices via $ heuristics, free trial / freemium detection, and
 * per-seat vs flat pricing detection. When the page is JS-rendered, prices
 * are marked low confidence rather than guessed.
 */

import { fetchPage } from "./fetch.js";
import { extractPage, type PageExtract } from "./extract.js";
import {
  type Confidence,
  type Finding,
  pageEvidence,
} from "./evidence.js";

export interface PlanPrice {
  readonly planName: string;
  readonly monthly: number | null;
  readonly annualMonthly: number | null;
  readonly currency: string;
}

export interface Pricing {
  readonly plans: readonly PlanPrice[];
  readonly hasFreeTrial: boolean;
  readonly hasFreemium: boolean;
  readonly billingModel: "per-seat" | "flat" | "usage" | "unknown";
  readonly pricingPageFound: boolean;
  readonly pricingPageUrl: string | null;
}

const PRICE_RE = /([$€£])\s?([\d,]+(?:\.\d{1,2})?)/g;
const ANNUAL_HINT = /annual|per year|\/yr|billed yearly/i;
const MONTH_HINT = /per month|\/mo|billed monthly/i;

const TRIAL_RE = /\bfree trial\b|\b\d+\s?-?day trial\b|\bstart (your )?free trial\b/i;
const FREEMIUM_RE = /\bfree (plan|tier|forever|edition)\b|\$0\b.{0,40}\bforever\b/i;
const PER_SEAT_RE = /per (user|seat)|per-user|per-seat|\/user\/|\/seat\//i;
const USAGE_RE = /per (1,?000 )?(credits?|events?|requests?|minutes?|messages?|api calls?)|usage-based|pay as you go/i;

const PLAN_NAME_RE =
  /\b(starter|growth|scale|pro|plus|team|teams|business|enterprise|free|basic|standard|premium|ultimate|founder|hobby)\b/gi;

const PRICE_PATHS = ["/pricing", "/plans", "/pricing/", "/en/pricing"];

const extractPrices = (text: string): Array<{ amount: number; currency: string; annual: boolean }> => {
  const out: Array<{ amount: number; currency: string; annual: boolean }> = [];
  PRICE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const window = 120;
  while ((m = PRICE_RE.exec(text)) !== null) {
    const amount = Number((m[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount > 100_000) continue;
    const start = Math.max(0, (m.index ?? 0) - window);
    const end = Math.min(text.length, (m.index ?? 0) + window);
    const context = text.slice(start, end);
    out.push({
      amount,
      currency: m[1] ?? "$",
      annual: ANNUAL_HINT.test(context) && !MONTH_HINT.test(context),
    });
  }
  return out;
};

export const analyzePricing = (
  extract: PageExtract,
  url: string,
): Finding<Pricing> => {
  const evidence: ReturnType<typeof pageEvidence>[] = [];
  const limitations: string[] = [];
  let confidence: Confidence = "medium";

  const text = [
    extract.title,
    ...extract.h1s,
    ...extract.headings.map((h) => h.text),
    ...extract.allLinks.map((l) => l.text),
    extract.bodyText,
  ].join(" ");

  if (extract.looksJsRendered) {
    confidence = "low";
    limitations.push(
      "Pricing page looks JS-rendered; prices in the fetched HTML may be incomplete.",
    );
  }

  const prices = extractPrices(text);
  evidence.push(
    pageEvidence(
      url,
      prices.length > 0
        ? `Prices seen: ${prices.slice(0, 6).map((p) => `${p.currency}${p.amount}${p.annual ? "/yr" : ""}`).join(", ")}`
        : "No $ prices found in fetched HTML",
    ),
  );

  // Plan names, each paired with the nearest price that follows it in the
  // body copy (within a tight window). Prices are never assigned
  // positionally: an unassociated plan keeps null prices instead of a
  // wrong number.
  const planNames = new Set<string>();
  PLAN_NAME_RE.lastIndex = 0;
  let nm: RegExpExecArray | null;
  const nameSource = extract.headings.map((h) => h.text).join(" | ");
  while ((nm = PLAN_NAME_RE.exec(nameSource)) !== null) {
    if (nm[1]) planNames.add(nm[1].toLowerCase());
  }

  const priceAfter = (
    haystack: string,
    fromIdx: number,
    windowChars: number,
  ): { amount: number; currency: string; annual: boolean } | null => {
    const slice = haystack.slice(fromIdx, fromIdx + windowChars);
    PRICE_RE.lastIndex = 0;
    const m = PRICE_RE.exec(slice);
    if (!m) return null;
    const amount = Number((m[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(amount)) return null;
    const start = Math.max(0, (m.index ?? 0) - 60);
    const context = slice.slice(start, (m.index ?? 0) + 60);
    return {
      amount,
      currency: m[1] ?? "$",
      annual: ANNUAL_HINT.test(context) && !MONTH_HINT.test(context),
    };
  };

  const bodyLower = extract.bodyText.toLowerCase();
  const plans: PlanPrice[] = [...planNames].slice(0, 6).map((planName) => {
    const idx = bodyLower.indexOf(planName);
    const near = idx >= 0 ? priceAfter(extract.bodyText, idx, 200) : null;
    return {
      planName,
      monthly: near && !near.annual ? near.amount : null,
      annualMonthly: near && near.annual ? near.amount : null,
      currency: near?.currency ?? "$",
    };
  });

  const billingModel: Pricing["billingModel"] = PER_SEAT_RE.test(text)
    ? "per-seat"
    : USAGE_RE.test(text)
      ? "usage"
      : /flat|unlimited/i.test(text) && prices.length > 0
        ? "flat"
        : "unknown";

  const hasFreeTrial = TRIAL_RE.test(text);
  const hasFreemium = FREEMIUM_RE.test(text);
  if (prices.length === 0 && !hasFreeTrial && !hasFreemium) {
    confidence = "low";
    limitations.push(
      "No prices, trial, or free-plan signals in fetched HTML; pricing may be hidden behind JS or a contact-sales gate.",
    );
  }

  const pricedPlans = plans.filter(
    (p) => p.monthly !== null || p.annualMonthly !== null,
  );
  const planSummary =
    plans.length > 0
      ? plans
          .map((p) =>
            p.monthly !== null
              ? `${p.planName} ${p.currency}${p.monthly}/mo`
              : p.annualMonthly !== null
                ? `${p.planName} ${p.currency}${p.annualMonthly}/mo annual`
                : `${p.planName} (price not linked in copy)`,
          )
          .join("; ")
      : "no plan names found";

  return {
    claim:
      prices.length > 0
        ? `Plans: ${planSummary}. ${prices.length} price mention(s) in copy.`
        : hasFreeTrial || hasFreemium
          ? `Free trial or free tier offered; plans seen: ${plans.map((p) => p.planName).join(", ") || "none"}. No list prices in HTML.`
          : "No pricing signals found in fetched HTML",
    confidence,
    data: {
      plans,
      hasFreeTrial,
      hasFreemium,
      billingModel,
      pricingPageFound: true,
      pricingPageUrl: url,
    },
    evidence,
    limitations:
      pricedPlans.length < plans.length && prices.length > 0
        ? [
            ...limitations,
            "Some prices could not be linked to a specific plan; they are reported as copy mentions only.",
          ]
        : limitations,
  };
};

export const pricingForUrl = async (url: string): Promise<Finding<Pricing>> => {
  const res = await fetchPage(url);
  if (!res.ok || !res.html) {
    return {
      claim: `Could not load pricing page at ${url}`,
      confidence: "low",
      data: {
        plans: [],
        hasFreeTrial: false,
        hasFreemium: false,
        billingModel: "unknown",
        pricingPageFound: false,
        pricingPageUrl: null,
      },
      evidence: [
        pageEvidence(url, `fetch failed: HTTP ${res.status || res.error}`, "fetch"),
      ],
      limitations: [
        `Pricing fetch failed (${res.status || res.error}); pricing unknown.`,
      ],
    };
  }
  return analyzePricing(extractPage(res.html, res.finalUrl), res.finalUrl);
};

export const findPricingUrl = async (
  origin: string,
): Promise<{ url: string | null; limitation: string | null }> => {
  for (const path of PRICE_PATHS) {
    const url = new URL(path, origin).toString();
    const res = await fetchPage(url);
    if (res.ok && res.html && res.html.length > 500) return { url: res.finalUrl, limitation: null };
  }
  return {
    url: null,
    limitation: `No pricing page found at ${PRICE_PATHS.join(", ")}; pricing signals will be missing.`,
  };
};
