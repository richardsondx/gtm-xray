/**
 * motion.ts: a motion and funnel verdict from observed evidence, not
 * from what the user typed. Panel fix, Oct 30: the old teardown returned
 * positioning, pricing, channels, and loops, but never said whether the
 * company is self-serve, sales-led, or hybrid, what the primary call
 * to action is, or where signup or demo lives. A GTM head cannot staff,
 * budget, or sequence from facets alone.
 *
 * Motion is inferred, and labelled as such: self-serve signals are a
 * free tier or trial, or a Start free / Sign up / Try free call to
 * action; sales signals are a Book a demo / Talk to sales / Contact
 * sales call to action, or a pricing page with only custom enterprise
 * pricing. Both signals present means hybrid. Neither means unknown,
 * not a guess.
 */

import { fetchPage } from "./fetch.js";
import { extractPage, type ClassifiedLink } from "./extract.js";
import {
  type Confidence,
  type Finding,
  pageEvidence,
} from "./evidence.js";
import type { Pricing } from "./pricing.js";

export type Motion = "self-serve" | "sales-led" | "hybrid" | "unknown";

export interface MotionVerdict {
  readonly motion: Motion;
  readonly primaryCta: string | null;
  readonly primaryCtaUrl: string | null;
  readonly signupUrl: string | null;
  readonly demoUrl: string | null;
  readonly hasFreeTierOrTrial: boolean;
}

const CTA_PATTERNS: ReadonlyArray<readonly [RegExp, "self" | "sales"]> = [
  [/start free|try free|get started|sign up|create (a )?free account|start (your )?trial/i, "self"],
  [/book (a )?demo|request (a )?demo|talk to sales|contact sales|schedule (a )?call/i, "sales"],
  [/watch (a )?demo|see (it )?in action/i, "sales"],
];

const findCta = (
  links: readonly ClassifiedLink[],
): { text: string; url: string; kind: "self" | "sales" } | null => {
  for (const link of links) {
    for (const [re, kind] of CTA_PATTERNS) {
      if (re.test(link.text)) return { text: link.text, url: link.href, kind };
    }
  }
  return null;
};

const findPath = (
  links: readonly ClassifiedLink[],
  re: RegExp,
): string | null => {
  for (const link of links) {
    if (re.test(link.href) || re.test(link.text)) return link.href;
  }
  return null;
};

export const analyzeMotion = (
  homepageLinks: readonly ClassifiedLink[],
  pricing: Finding<Pricing> | null,
  homepageUrl: string,
): Finding<MotionVerdict> => {
  const cta = findCta(homepageLinks);
  const signupUrl = findPath(homepageLinks, /\/signup|\/register|\/get-started|\/start/i);
  const demoUrl = findPath(homepageLinks, /\/demo|\/book|\/contact-sales/i);
  const hasFreeTierOrTrial =
    (pricing?.data.hasFreemium ?? false) ||
    (pricing?.data.hasFreeTrial ?? false) ||
    (pricing?.data.plans.some((p) => p.monthly === 0) ?? false);
  const pricedPlans = pricing?.data.plans.filter(
    (p) => p.monthly !== null || p.annualMonthly !== null,
  ).length ?? 0;
  const onlyCustomPricing =
    (pricing?.data.plans.length ?? 0) > 0 && pricedPlans === 0;

  const selfSignal = hasFreeTierOrTrial || cta?.kind === "self" || signupUrl !== null;
  const salesSignal =
    cta?.kind === "sales" || demoUrl !== null || onlyCustomPricing;

  let motion: Motion = "unknown";
  let confidence: Confidence = "low";
  if (selfSignal && salesSignal) {
    motion = "hybrid";
    confidence = "medium";
  } else if (selfSignal) {
    motion = "self-serve";
    confidence = "medium";
  } else if (salesSignal) {
    motion = "sales-led";
    confidence = "medium";
  }

  const limitations: string[] = [];
  if (motion === "unknown") {
    limitations.push(
      "No self-serve signup call to action, free tier, trial, demo, or sales contact was found on the homepage; motion could not be inferred, it was not guessed.",
    );
  }
  if (motion === "hybrid") {
    limitations.push(
      "Both self-serve and sales signals are present; the split between self-serve and sales-led revenue cannot be told from the public site alone.",
    );
  }

  return {
    claim:
      motion === "unknown"
        ? "Motion could not be inferred from the homepage or pricing page"
        : `Motion: ${motion}${cta ? `, primary call to action "${cta.text}"` : ""}${hasFreeTierOrTrial ? ", free tier or trial present" : ""}`,
    confidence,
    data: {
      motion,
      primaryCta: cta?.text ?? null,
      primaryCtaUrl: cta?.url ?? null,
      signupUrl,
      demoUrl,
      hasFreeTierOrTrial,
    },
    evidence: cta
      ? [pageEvidence(cta.url, `Call to action: "${cta.text}"`)]
      : [pageEvidence(homepageUrl, "No call to action found on the homepage")],
    limitations,
  };
};

export const motionForHomepage = async (
  homepageUrl: string,
  pricing: Finding<Pricing> | null,
): Promise<Finding<MotionVerdict>> => {
  const res = await fetchPage(homepageUrl);
  if (!res.ok || !res.html) {
    return {
      claim: "Motion could not be inferred; homepage fetch failed",
      confidence: "low",
      data: {
        motion: "unknown",
        primaryCta: null,
        primaryCtaUrl: null,
        signupUrl: null,
        demoUrl: null,
        hasFreeTierOrTrial: pricing?.data.hasFreemium ?? false,
      },
      evidence: [
        pageEvidence(homepageUrl, `Homepage fetch failed: HTTP ${res.status || res.error}`, "fetch"),
      ],
      limitations: [`Homepage fetch failed (${res.status || res.error}); motion unknown.`],
    };
  }
  const extract = extractPage(res.html, res.finalUrl);
  return analyzeMotion(extract.allLinks, pricing, res.finalUrl);
};
