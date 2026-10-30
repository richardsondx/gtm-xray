/**
 * positioning.ts: reads the hero and surrounding copy to recover how a
 * company positions itself: headline, subhead, claimed category, audience
 * signals, and the types of social proof on the page.
 */

import { fetchPage } from "./fetch.js";
import { extractPage, type PageExtract } from "./extract.js";
import {
  type Confidence,
  type Finding,
  pageEvidence,
} from "./evidence.js";

export interface Positioning {
  readonly headline: string;
  readonly subhead: string;
  readonly categoryClaim: string | null;
  readonly audienceSignals: readonly string[];
  readonly socialProof: readonly string[];
  readonly metaDescription: string;
}

const AUDIENCE_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfor (small )?teams?\b/i, "teams"],
  [/\bfor (enterprises?|large organizations?)\b/i, "enterprise"],
  [/\bfor (startups?|founders?)\b/i, "startups"],
  [/\bfor (developers?|engineers?|dev teams?)\b/i, "developers"],
  [/\bfor (marketers?|marketing teams?)\b/i, "marketers"],
  [/\bfor (sales teams?|salespeople|reps)\b/i, "sales teams"],
  [/\bfor (freelancers?|creators?)\b/i, "freelancers/creators"],
  [/\bfor (agencies|consultants?)\b/i, "agencies"],
  [/\bfor (remote teams?)\b/i, "remote teams"],
  [/\bfor individuals?\b/i, "individuals"],
  [/\bfor businesses?\b/i, "businesses"],
];

const PROOF_SIGNALS: ReadonlyArray<readonly [RegExp, string]> = [
  [/trusted by|powering|used by [\d,]+|loved by/i, "customer logos / named customers"],
  [/testimonial|what (our )?customers say/i, "testimonials"],
  [/\b[\d,]+\s?(customers|users|companies|teams)\b/i, "customer/user counts"],
  [/\bstars?\b.*github|github.*\bstars?\b/i, "GitHub stars"],
  [/case stud(y|ies)|customer stor/i, "customer stories"],
  [/g2|Capterra|product ?hunt/i, "review-site badges"],
];

const CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [
  /the ([a-z][a-z\s-]{2,40}?) (platform|tool|software|app|solution) for/i,
  /([A-Z][A-Za-z\s-]{2,40}) (platform|software|tool) built for/i,
];

export const analyzePositioning = (
  extract: PageExtract,
  url: string,
): Finding<Positioning> => {
  const evidence = [pageEvidence(url, `${extract.title} | ${extract.h1s[0] ?? ""}`)];
  const limitations: string[] = [];
  let confidence: Confidence = "high";

  if (extract.looksJsRendered) {
    confidence = "low";
    limitations.push(
      "Page looks JS-rendered; hero copy may be incomplete in the fetched HTML.",
    );
  }

  // JS-rendered pages (Higgsfield is the case that exposed this) often
  // have no h1 in the server HTML at all, so the report showed an empty
  // headline even though the page title and meta description were
  // fetched fine. Fall back to the page title, labelled as such, instead
  // of showing nothing: the title is fetched evidence, not invented copy.
  const headline = extract.h1s[0] ?? extract.title;
  const subhead = extract.firstParaAfterH1 || extract.metaDescription || "";
  if (!extract.h1s[0]) {
    confidence = "low";
    limitations.push(
      "No h1 found on the page; page title used as the headline instead.",
    );
  }

  const body = `${extract.title} ${extract.h1s.join(" ")} ${subhead}`.slice(0, 2000);
  const audienceSignals = AUDIENCE_KEYWORDS.filter(([re]) =>
    re.test(body),
  ).map(([, label]) => label);

  const allText = body + " " + extract.headings.map((h) => h.text).join(" ");
  const socialProof = PROOF_SIGNALS.filter(([re]) => re.test(allText)).map(
    ([, label]) => label,
  );

  let categoryClaim: string | null = null;
  for (const re of CATEGORY_PATTERNS) {
    const m = re.exec(`${extract.title} ${subhead}`);
    if (m?.[1]) {
      categoryClaim = `${m[1].trim()} ${m[2] ?? ""}`.trim();
      break;
    }
  }

  return {
    claim: extract.h1s[0]
      ? `Hero headline is "${headline.slice(0, 90)}"`
      : headline
        ? `Page title used as headline (no h1 in HTML): "${headline.slice(0, 90)}"`
        : "No readable hero headline found",
    confidence,
    data: {
      headline,
      subhead,
      categoryClaim,
      audienceSignals,
      socialProof,
      metaDescription: extract.metaDescription,
    },
    evidence,
    limitations,
  };
};

/** Fetch + extract + analyze in one step for the homepage. */
export const positioningForUrl = async (
  url: string,
): Promise<Finding<Positioning>> => {
  const res = await fetchPage(url);
  if (!res.ok || !res.html) {
    return {
      claim: `Could not load ${url}`,
      confidence: "low",
      data: {
        headline: "",
        subhead: "",
        categoryClaim: null,
        audienceSignals: [],
        socialProof: [],
        metaDescription: "",
      },
      evidence: [
        pageEvidence(url, `fetch failed: HTTP ${res.status || res.error}`, "fetch"),
      ],
      limitations: [`Homepage fetch failed (${res.status || res.error}); no positioning data.`],
    };
  }
  return analyzePositioning(extractPage(res.html, res.finalUrl), res.finalUrl);
};
