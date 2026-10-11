/**
 * teardown.ts: orchestrator. Runs positioning + pricing + channels + loops
 * for a domain and returns one GtmTeardown. Each facet degrades
 * independently: a failed pricing fetch does not block channel mapping.
 */

import { fetchPage } from "./fetch.js";
import { extractPage } from "./extract.js";
import { positioningForUrl, type Positioning } from "./positioning.js";
import { pricingForUrl, findPricingUrl, type Pricing } from "./pricing.js";
import { mapChannels, type ChannelSignal } from "./channels.js";
import { findAcquisitionLoops, type AcquisitionLoop } from "./loops.js";
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
  readonly channels: readonly Finding<ChannelSignal>[];
  readonly loops: readonly Finding<AcquisitionLoop>[];
  readonly limitations: readonly string[];
}

export const runTeardown = async (
  company: string,
  domain: string,
  depth: TeardownDepth = "quick",
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
            hasFreemium: false,
            billingModel: "unknown" as const,
            pricingPageFound: false,
            pricingPageUrl: null,
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

  limitations.push(
    ...positioning.limitations,
    ...pricingResult.limitations,
    ...channelMap.limitations,
    ...loopMap.limitations,
  );

  const teardown: GtmTeardown = {
    company,
    domain,
    homepageUrl,
    depth,
    positioning,
    pricing: pricingResult,
    channels: channelMap.channels,
    loops: loopMap.loops,
    limitations: [...new Set(limitations)],
  };

  return { findings: teardown, limitations: teardown.limitations, generated_at: nowIso() };
};
