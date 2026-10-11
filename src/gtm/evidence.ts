/**
 * Evidence discipline: every finding the tool produces carries its claim,
 * a confidence level, the raw evidence behind it, and explicit limitations.
 * Reports always end with a "What we could not verify" section built from
 * the limitations recorded here.
 */

export type Confidence = "high" | "medium" | "low";

export interface EvidenceItem {
  /** Where the evidence came from: "fetch" (HTTP), "page" (parsed page content), "sitemap", "api", or "manual" (a suggested human check). */
  readonly type: "fetch" | "page" | "sitemap" | "api" | "manual";
  /** The URL the evidence was observed at, or a label for manual checks. */
  readonly url: string;
  /** A short verbatim or near-verbatim snippet (under ~200 chars). */
  readonly snippet: string;
}

export interface Finding<T> {
  /** The concrete claim being made, phrased as a fact about the observed surface. */
  readonly claim: string;
  readonly confidence: Confidence;
  /** The structured result behind the claim. */
  readonly data: T;
  /** What backs the claim. Empty evidence with medium/low confidence is a smell. */
  readonly evidence: readonly EvidenceItem[];
  /** What could not be established, or caveats on the claim. These flow into "What we could not verify". */
  readonly limitations: readonly string[];
}

export interface GtmReportEnvelope<T> {
  readonly findings: T;
  readonly limitations: readonly string[];
  readonly generated_at: string;
}

export const nowIso = (): string => new Date().toISOString();

/** Build an evidence item from a fetched page, truncating the snippet. */
export const pageEvidence = (
  url: string,
  snippet: string,
  type: EvidenceItem["type"] = "page",
): EvidenceItem => ({
  type,
  url,
  snippet: snippet.length > 200 ? snippet.slice(0, 197) + "..." : snippet,
});

/** One-liner to record "we could not check this" limitations. */
export const unverifiable = (what: string, how: string): string =>
  `${what} (suggested check: ${how})`;
