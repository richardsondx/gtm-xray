import { fetchPage } from "../../../lib/engine/fetch";
import { positioningForUrl } from "../../../lib/engine/positioning";
import {
  findPricingUrl,
  pricingForUrl,
  type Pricing,
} from "../../../lib/engine/pricing";
import { mapChannels } from "../../../lib/engine/channels";
import { findAcquisitionLoops } from "../../../lib/engine/loops";
import {
  type Finding,
  type GtmReportEnvelope,
  nowIso,
} from "../../../lib/engine/evidence";
import {
  type GtmTeardown,
  type TeardownDepth,
} from "../../../lib/engine/teardown";

export const runtime = "nodejs";
export const maxDuration = 60;

const DOMAIN_RE =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function sanitizeDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/:\d+$/, "").replace(/^www\./, "");
  return DOMAIN_RE.test(d) ? d : null;
}

type Stage = "positioning" | "pricing" | "channels" | "loops";

export async function POST(req: Request) {
  let body: { domain?: unknown; depth?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const domain = sanitizeDomain(body.domain);
  if (!domain) {
    return Response.json(
      { error: "Provide a valid domain, for example cal.com." },
      { status: 400 },
    );
  }
  const depth: TeardownDepth = body.depth === "full" ? "full" : "quick";

  const encoder = new TextEncoder();
  const send = (obj: unknown, controller: ReadableStreamDefaultController) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const limitations: string[] = [];
        const origin = `https://${domain}`;

        const home = await fetchPage(origin);
        const homepageUrl = home.finalUrl;
        if (!home.ok || !home.html) {
          limitations.push(
            `Homepage fetch failed (${home.status || home.error}); teardown is degraded.`,
          );
        }

        // Positioning and pricing both start from the homepage/pricing pages;
        // run them together so the first two stages finish faster.
        send({ stage: "positioning" satisfies Stage }, controller);
        send({ stage: "pricing" satisfies Stage }, controller);
        const [positioning, pricingResult] = await Promise.all([
          positioningForUrl(homepageUrl),
          (async (): Promise<Finding<Pricing>> => {
            const found = await findPricingUrl(origin);
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
        ]);

        send({ stage: "channels" satisfies Stage }, controller);
        const channelMap = await mapChannels(domain);

        const loopMap =
          depth === "full"
            ? await (async () => {
                send({ stage: "loops" satisfies Stage }, controller);
                return findAcquisitionLoops(domain);
              })()
            : { loops: [], limitations: ["Loops skipped at quick depth; use depth=full."] };

        limitations.push(
          ...positioning.limitations,
          ...pricingResult.limitations,
          ...channelMap.limitations,
          ...loopMap.limitations,
        );

        const teardown: GtmTeardown = {
          company: domain,
          domain,
          homepageUrl,
          depth,
          positioning,
          pricing: pricingResult,
          channels: channelMap.channels,
          loops: loopMap.loops,
          limitations: [...new Set(limitations)],
        };

        const envelope: GtmReportEnvelope<GtmTeardown> = {
          findings: teardown,
          limitations: teardown.limitations,
          generated_at: nowIso(),
        };
        send({ done: true, teardown, generated_at: envelope.generated_at }, controller);
      } catch {
        send(
          { error: "The teardown failed partway through. Try again or use quick depth." },
          controller,
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
