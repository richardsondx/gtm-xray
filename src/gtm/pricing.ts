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
  /** Included quantity in the plan card, for example 270 credits. Null when not stated. */
  readonly includedQuantity: number | null;
  /** Unit for includedQuantity, for example "credits", "seats", or "users". Null when not stated. */
  readonly unit: string | null;
}

export interface Pricing {
  readonly plans: readonly PlanPrice[];
  readonly hasFreeTrial: boolean;
  /** Trial length in days when stated, for example 14 for a 14-day trial. Null when not stated. */
  readonly trialDays: number | null;
  readonly hasFreemium: boolean;
  readonly billingModel: "per-seat" | "flat" | "usage" | "unknown";
  readonly pricingPageFound: boolean;
  readonly pricingPageUrl: string | null;
  /** How this finding was captured. "fetch" is server HTML, "rendered" is a browser snapshot. */
  readonly source: "fetch" | "rendered";
}

const PRICE_RE = /([$€£])\s?([\d,]+(?:\.\d{1,2})?)/g;
const ANNUAL_HINT = /annual|per year|\/yr|billed yearly/i;
const MONTH_HINT = /per month|\/mo|billed monthly/i;

/**
 * Panel fix, Oct 30: "$47 per month, billed annually" was previously
 * classified as monthly, because MONTH_HINT ("per month") cancelled
 * ANNUAL_HINT. An explicit "billed annually" or "billed yearly" now
 * wins over "per month" in the same string; "billed monthly" wins
 * the other way. Only a bare annual hint without a monthly hint
 * falls through to the old rule.
 */
const isAnnualPrice = (context: string): boolean => {
  if (/billed annually|billed yearly|annual billing/i.test(context)) return true;
  if (/billed monthly/i.test(context)) return false;
  return ANNUAL_HINT.test(context) && !MONTH_HINT.test(context);
};

const TRIAL_RE = /\bfree trial\b|\b\d+\s?-?day trial\b|\bstart (your )?free trial\b/i;
const TRIAL_DAYS_RE = /(\d+)\s*-?day trial/i;
const FREEMIUM_RE = /\bfree (plan|tier|forever|edition)\b|\$0\b.{0,40}\bforever\b/i;
const PER_SEAT_RE = /per (user|seat)|per-user|per-seat|\/user\/|\/seat\//i;
const USAGE_RE = /per (1,?000 )?(credits?|events?|requests?|minutes?|messages?|api calls?)|usage-based|pay as you go|\d[\d,]*\s*credits?\s*(per|a)?\s*month/i;

const PLAN_NAME_RE =
  /\b(starter|growth|scale|pro|plus|team|teams|business|enterprise|free|basic|standard|premium|ultimate|ultra|max|solo|founder|hobby|organizations?|creator)\b/gi;

/**
 * Only credits are extracted as an included quantity. Seats and users
 * are usually "per user" pricing, not "includes N users", and scanning
 * for them produced false quantities like "free, 1 users" on Cal.com.
 * Billing model already records per-seat separately.
 */
const QUANTITY_RE = /(\d[\d,]*)\s*credits?\b/i;

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
      annual: isAnnualPrice(context),
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

  // Old bug, fixed Oct 30: this used only the FIRST occurrence of a plan
  // name in the body, which is usually a nav link ("For Teams", "For
  // Enterprises"), so the price within 200 chars of that nav link was
  // nothing, and every plan came back "price not linked" even when the
  // price sat right under the plan card later on the page. Now every
  // occurrence of a plan name is tried, and each plan takes the nearest
  // price occurrence (before or after, within 600 chars), with each price
  // occurrence claimed by at most one plan. A price is only taken when no
  // other plan name sits between it and the plan name: without that guard
  // the first fix wrongly gave Free the next card's $12 and Enterprise
  // the previous card's $28. A plan with no price in its own card still
  // keeps null instead of a guessed number.
  type PriceOccurrence = {
    index: number;
    amount: number;
    currency: string;
    annual: boolean;
  };
  const priceOccurrences: PriceOccurrence[] = [];
  PRICE_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PRICE_RE.exec(extract.bodyText)) !== null) {
    const amount = Number((pm[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount > 100_000) continue;
    const idx = pm.index ?? 0;
    const context = extract.bodyText.slice(
      Math.max(0, idx - 60),
      idx + 60,
    );
    priceOccurrences.push({
      index: idx,
      amount,
      currency: pm[1] ?? "$",
      annual: isAnnualPrice(context),
    });
  }
  const claimedPrices = new Set<number>();
  const bodyLower = extract.bodyText.toLowerCase();
  const pageCurrency = priceOccurrences[0]?.currency ?? "$";
  const quantityFor = (planName: string): { quantity: number | null; unit: string | null } => {
    let searchFrom = 0;
    for (;;) {
      const idx = bodyLower.indexOf(planName, searchFrom);
      if (idx < 0) break;
      const window = extract.bodyText.slice(idx, idx + 600);
      QUANTITY_RE.lastIndex = 0;
      const q = QUANTITY_RE.exec(window);
      if (q?.[1]) {
        const between = window.slice(0, q.index ?? 0).toLowerCase();
        const intervening = [...planNames].some(
          (other) => other !== planName && new RegExp(`\\b${other}\\b`).test(between),
        );
        if (!intervening) {
          return {
            quantity: Number(q[1].replace(/,/g, "")),
            unit: "credits",
          };
        }
      }
      searchFrom = idx + planName.length;
    }
    return { quantity: null, unit: null };
  };
  const plans: PlanPrice[] = [...planNames].slice(0, 8).map((planName) => {
    const qty = quantityFor(planName);
    // A "free" plan must never borrow a neighbouring card's price: the
    // cal.com page has a "Free forever" section followed directly by
    // $12/$28, with no other plan name in between, so the nearest-price
    // rule still gave Free $12. A free tier costs $0 by definition, so
    // when the page says so in words, record $0; otherwise leave it null.
    if (
      planName === "free" &&
      /\bfree (forever|plan|tier)\b/i.test(extract.bodyText)
    ) {
      return {
        planName,
        monthly: 0,
        annualMonthly: null,
        currency: pageCurrency,
        includedQuantity: qty.quantity,
        unit: qty.unit,
      };
    }
    let best: { price: PriceOccurrence; distance: number } | null = null;
    let searchFrom = 0;
    for (;;) {
      const idx = bodyLower.indexOf(planName, searchFrom);
      if (idx < 0) break;
      // Word boundary, so "pro" does not match "product" and "free" does
      // not match "freedom".
      const beforeOk = idx === 0 || !/[a-z0-9]/.test(bodyLower[idx - 1] ?? "");
      const afterIdx = idx + planName.length;
      const afterOk =
        afterIdx >= bodyLower.length || !/[a-z0-9]/.test(bodyLower[afterIdx] ?? "");
      if (beforeOk && afterOk) {
        for (const price of priceOccurrences) {
          if (claimedPrices.has(price.index)) continue;
          if (planName === "free" && price.amount !== 0) continue;
          const priceEnd = price.index + String(price.amount).length + 1;
          const distance =
            price.index >= afterIdx
              ? price.index - afterIdx
              : idx - priceEnd;
          if (distance < 0 || distance > 600) continue;
          // No other plan name may sit between the plan and its price,
          // otherwise the price belongs to that other plan's card.
          const between =
            price.index >= afterIdx
              ? bodyLower.slice(afterIdx, price.index)
              : bodyLower.slice(priceEnd, idx);
          const intervening = [...planNames].some(
            (other) =>
              other !== planName &&
              new RegExp(`\\b${other}\\b`).test(between),
          );
          if (intervening) continue;
          if (!best || distance < best.distance) best = { price, distance };
        }
      }
      searchFrom = idx + planName.length;
    }
    if (best) claimedPrices.add(best.price.index);
    const near = best?.price ?? null;
    return {
      planName,
      monthly: near && !near.annual ? near.amount : null,
      annualMonthly: near && near.annual ? near.amount : null,
      currency: near?.currency ?? pageCurrency,
      includedQuantity: qty.quantity,
      unit: qty.unit,
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
  const trialDaysMatch = TRIAL_DAYS_RE.exec(text);
  const trialDays = trialDaysMatch?.[1] ? Number(trialDaysMatch[1]) : null;
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
                : `${p.planName} (price not found)`,
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
      trialDays,
      hasFreemium,
      billingModel,
      pricingPageFound: true,
      pricingPageUrl: url,
      source: "fetch",
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
        trialDays: null,
        hasFreemium: false,
        billingModel: "unknown",
        pricingPageFound: false,
        pricingPageUrl: null,
        source: "fetch",
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

/**
 * Merge a monthly-view finding with an annual-view finding into one
 * paired pricing finding. Panel fix, Oct 30: the old CLI code used
 * `annualRendered ?? initialRendered`, so a successful annual click
 * discarded the monthly view entirely. Here monthly comes from the
 * initial view and annual comes from the annual view, per plan.
 * An annual-view price that was read as monthly (because the annual
 * view still says "per month") is treated as the annual price, since
 * the snapshot label, not the price string alone, says which view it is.
 */
export const mergePricingSnapshots = (
  initial: Finding<Pricing>,
  annual: Finding<Pricing> | null,
): Finding<Pricing> => {
  if (!annual) return initial;
  const byName = new Map<string, PlanPrice>();
  for (const p of initial.data.plans) byName.set(p.planName, p);
  for (const p of annual.data.plans) {
    const existing = byName.get(p.planName);
    const annualPrice = p.annualMonthly ?? p.monthly;
    if (existing) {
      byName.set(p.planName, {
        planName: p.planName,
        monthly: existing.monthly,
        annualMonthly: annualPrice ?? existing.annualMonthly,
        currency: existing.currency,
        includedQuantity: existing.includedQuantity ?? p.includedQuantity,
        unit: existing.unit ?? p.unit,
      });
    } else {
      byName.set(p.planName, {
        planName: p.planName,
        monthly: null,
        annualMonthly: annualPrice,
        currency: p.currency,
        includedQuantity: p.includedQuantity,
        unit: p.unit,
      });
    }
  }
  const plans = [...byName.values()];
  const summary = plans
    .map((p) => {
      const parts: string[] = [];
      if (p.monthly !== null) parts.push(`${p.currency}${p.monthly}/mo`);
      if (p.annualMonthly !== null) parts.push(`${p.currency}${p.annualMonthly}/mo annual`);
      if (p.includedQuantity !== null && p.unit) parts.push(`${p.includedQuantity} ${p.unit}`);
      return parts.length > 0 ? `${p.planName} ${parts.join(", ")}` : `${p.planName} (price not found)`;
    })
    .join("; ");
  return {
    claim: plans.length > 0 ? `Plans: ${summary}.` : "No pricing signals found in rendered views",
    confidence: plans.some((p) => p.monthly !== null || p.annualMonthly !== null)
      ? "medium"
      : "low",
    data: {
      plans,
      hasFreeTrial: initial.data.hasFreeTrial || annual.data.hasFreeTrial,
      trialDays: initial.data.trialDays ?? annual.data.trialDays,
      hasFreemium: initial.data.hasFreemium || annual.data.hasFreemium,
      billingModel:
        initial.data.billingModel !== "unknown"
          ? initial.data.billingModel
          : annual.data.billingModel,
      pricingPageFound: true,
      pricingPageUrl: initial.data.pricingPageUrl ?? annual.data.pricingPageUrl,
      source: "rendered",
    },
    evidence: [
      ...initial.evidence,
      ...annual.evidence.map((e) => ({ ...e, snippet: `Annual view: ${e.snippet}` })),
    ],
    limitations: [...new Set([...initial.limitations, ...annual.limitations])],
  };
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
