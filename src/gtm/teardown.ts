/**
 * teardown.ts: orchestrator. Runs positioning + pricing + channels + loops
 * for a domain and returns one GtmTeardown. Each facet degrades
 * independently: a failed pricing fetch does not block channel mapping.
 */

import { fetchPage } from "./fetch.js";
import { extractPage } from "./extract.js";
import { positioningForUrl, type Positioning } from "./positioning.js";
import {
  pricingForUrl,
  findPricingUrl,
  analyzePricing,
  mergePricingSnapshots,
  type Pricing,
} from "./pricing.js";
import { mapChannels, type ChannelSignal } from "./channels.js";
import { findAcquisitionLoops, type AcquisitionLoop } from "./loops.js";
import { motionForHomepage, type MotionVerdict } from "./motion.js";
import { renderPage } from "./render.js";
import {
  type Finding,
  type GtmReportEnvelope,
  nowIso,
} from "./evidence.js";

export type TeardownDepth = "quick" | "full";

export interface GtmTeardown {
  readonly company: string;
  readonly domain: string;
  readonly homepageUrl: string;
  readonly depth: TeardownDepth;
  readonly positioning: Finding<Positioning>;
  readonly pricing: Finding<Pricing>;
  readonly motion: Finding<MotionVerdict>;
  readonly channels: readonly Finding<ChannelSignal>[];
  readonly loops: readonly Finding<AcquisitionLoop>[];
  readonly limitations: readonly string[];
}

export const runTeardown = async (
  company: string,
  domain: string,
  depth: TeardownDepth = "quick",
  opts: { renderPricing?: boolean } = {},
): Promise<GtmReportEnvelope<GtmTeardown>> => {
  const limitations: string[] = [];
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;

  const home = await fetchPage(origin);
  const homepageUrl = home.finalUrl;
  if (!home.ok || !home.html) {
    limitations.push(
      `Homepage fetch failed (${home.status || home.error}); teardown is degraded.`,
    );
  }

  // Run facets in parallel; each handles its own failures.
  const [positioning, pricingResult, channelMap, loopMap] = await Promise.all([
    positioningForUrl(homepageUrl),
    (async () => {
      const found = await findPricingUrl(origin);
      if (found.limitation) limitations.push(found.limitation);
      if (!found.url) {
        return {
          claim: "No pricing page found",
          confidence: "low" as const,
          data: {
            plans: [],
            hasFreeTrial: false,
            trialDays: null,
            hasFreemium: false,
            billingModel: "unknown" as const,
            pricingPageFound: false,
            pricingPageUrl: null,
            source: "fetch" as const,
          },
          evidence: [],
          limitations: found.limitation ? [found.limitation] : [],
        };
      }
      return pricingForUrl(found.url);
    })(),
    mapChannels(domain),
    depth === "full" ? findAcquisitionLoops(domain) : Promise.resolve({ loops: [], limitations: ["Loops skipped at quick depth; use depth=full."] }),
  ]);

  // Panel fix, Oct 30: rendered pricing is no longer a side command.
  // It runs inside teardown when fetch-only pricing found no priced
  // plans (the Higgsfield case: server HTML has zero prices), or when
  // the caller forces it. When fetch pricing already works, the fast
  // path stands and no browser is launched. A failed render never
  // overwrites the fetch result; it is recorded as a limitation.
  let pricing: Finding<Pricing> = pricingResult;
  const pricedPlans = pricingResult.data.plans.filter(
    (p) => p.monthly !== null || p.annualMonthly !== null,
  ).length;
  const shouldRender =
    opts.renderPricing === true ||
    (opts.renderPricing !== false &&
      pricingResult.data.pricingPageUrl !== null &&
      pricedPlans === 0);
  if (shouldRender && pricingResult.data.pricingPageUrl) {
    const rendered = await renderPage(pricingResult.data.pricingPageUrl, {
      interactPricing: true,
    });
    if (rendered.ok && rendered.snapshots.length > 0) {
      const initialSnapshot =
        rendered.snapshots.find((s) => s.label === "initial") ?? rendered.snapshots[0];
      if (!initialSnapshot) {
        limitations.push("Rendered pricing capture ran but returned no snapshot; fetch-only result stands.");
        const annualSnapshot = null;
        void annualSnapshot;
      } else {
      const annualSnapshot = rendered.snapshots.find((s) => s.label === "annual") ?? null;
      const initialFinding = analyzePricing(
        extractPage(initialSnapshot.html, rendered.finalUrl),
        rendered.finalUrl,
      );
      const annualFinding = annualSnapshot
        ? analyzePricing(extractPage(annualSnapshot.html, rendered.finalUrl), rendered.finalUrl)
        : null;
      const merged = mergePricingSnapshots(initialFinding, annualFinding);
      if (merged.data.plans.some((p) => p.monthly !== null || p.annualMonthly !== null)) {
        pricing = {
          ...merged,
          evidence: merged.evidence.map((e) => ({
            ...e,
            snippet: `Rendered page: ${e.snippet}`,
          })),
          limitations: [...merged.limitations, ...rendered.limitations],
        };
        limitations.push(
          `Pricing source: rendered page (${rendered.finalUrl}), captured ${rendered.renderedAt}; fetch-only pricing found no priced plans, so the rendered view stands.`,
        );
      } else {
        limitations.push(
          "Rendered pricing capture ran but found no priced plans; fetch-only result stands.",
        );
      }
      }
    } else {
      limitations.push(
        `Rendered pricing capture failed (${rendered.error ?? "unknown error"}); fetch-only result stands.`,
      );
    }
  }

  const motion = await motionForHomepage(homepageUrl, pricing);

  limitations.push(
    ...positioning.limitations,
    ...pricing.limitations,
    ...channelMap.limitations,
    ...loopMap.limitations,
    ...motion.limitations,
  );

  const teardown: GtmTeardown = {
    company,
    domain,
    homepageUrl,
    depth,
    positioning,
    pricing,
    motion,
    channels: channelMap.channels,
    loops: loopMap.loops,
    limitations: [...new Set(limitations)],
  };

  return { findings: teardown, limitations: teardown.limitations, generated_at: nowIso() };
};
