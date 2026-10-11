/**
 * registerGtmTools.ts: registers the six gtm-xray MCP tools on a plain
 * @modelcontextprotocol/sdk McpServer. Each tool returns
 * { findings, limitations, generated_at } so the evidence discipline holds
 * across the MCP boundary too.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runTeardown, type TeardownDepth } from "../gtm/teardown.js";
import { positioningForUrl } from "../gtm/positioning.js";
import { pricingForUrl, findPricingUrl } from "../gtm/pricing.js";
import { mapChannels } from "../gtm/channels.js";
import { findAcquisitionLoops } from "../gtm/loops.js";
import {
  buildDistributionPlan,
  type Motion,
  type TeardownSummary,
} from "../gtm/distributionPlan.js";
import { nowIso } from "../gtm/evidence.js";

const teardownSummarySchema = z.object({
  company: z.string(),
  channels: z.array(z.string()),
  loops: z.array(z.string()),
  price_point: z.number().nullable().optional(),
});

const toSummary = (s: z.infer<typeof teardownSummarySchema>): TeardownSummary => ({
  company: s.company,
  channels: s.channels,
  loops: s.loops,
  pricePoint: s.price_point ?? null,
});

const envelope = <T>(findings: T, limitations: readonly string[]) => ({
  findings,
  limitations,
  generated_at: nowIso(),
});

const textResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const registerGtmTools = (server: McpServer): void => {
  server.registerTool(
    "teardown_startup",
    {
      title: "Teardown a startup's GTM",
      description:
        "Reverse-engineer how a company gets customers: positioning, pricing, channels, and acquisition loops, each with evidence and confidence.",
      inputSchema: {
        company: z.string().describe("Company name, e.g. 'Cal.com'"),
        domain: z.string().describe("Domain, e.g. 'cal.com'"),
        depth: z
          .enum(["quick", "full"])
          .optional()
          .describe("full also detects acquisition loops (default quick)"),
      },
    },
    async ({ company, domain, depth }) => {
      const result = await runTeardown(
        company,
        domain,
        (depth ?? "quick") as TeardownDepth,
      );
      return textResult(result);
    },
  );

  server.registerTool(
    "analyze_positioning",
    {
      title: "Analyze positioning",
      description:
        "Extract a page's hero headline, subhead, category claim, audience signals, and social proof types.",
      inputSchema: {
        url: z.string().describe("Full URL of the page to analyze"),
      },
    },
    async ({ url }) => {
      const finding = await positioningForUrl(url);
      return textResult(
        envelope(finding, finding.limitations),
      );
    },
  );

  server.registerTool(
    "analyze_pricing",
    {
      title: "Analyze pricing",
      description:
        "Extract plan names, monthly/annual prices, free trial and freemium signals, and the billing model from a pricing page.",
      inputSchema: {
        url: z.string().describe("Full URL of the pricing page"),
      },
    },
    async ({ url }) => {
      const finding = await pricingForUrl(url);
      return textResult(envelope(finding, finding.limitations));
    },
  );

  server.registerTool(
    "map_channels",
    {
      title: "Map acquisition channels",
      description:
        "Detect which acquisition channels a company visibly invests in: content scale, social, community, integrations, programs, hiring signals, agent surfaces.",
      inputSchema: {
        domain: z.string().describe("Domain, e.g. 'cal.com'"),
      },
    },
    async ({ domain }) => {
      const map = await mapChannels(domain);
      return textResult(envelope(map.channels, map.limitations));
    },
  );

  server.registerTool(
    "find_acquisition_loops",
    {
      title: "Find acquisition loops",
      description:
        "Detect product-led acquisition loops: free tools, templates galleries, public share artifacts, referral terms, open source, API docs.",
      inputSchema: {
        domain: z.string().describe("Domain, e.g. 'cal.com'"),
      },
    },
    async ({ domain }) => {
      const map = await findAcquisitionLoops(domain);
      return textResult(envelope(map.loops, map.limitations));
    },
  );

  server.registerTool(
    "build_distribution_plan",
    {
      title: "Build distribution plan",
      description:
        "Rank channel bets for a new startup from teardown summaries: score = icpFit + intentLevel + competitorProof + speedBonus.",
      inputSchema: {
        startup: z.string().describe("One-liner describing the startup"),
        icp: z.string().describe("Ideal customer profile in one sentence"),
        price_point: z
          .number()
          .nullable()
          .optional()
          .describe("Monthly price in USD, if known"),
        motion: z
          .enum(["plg", "sales", "hybrid", "unknown"])
          .optional()
          .describe("Go-to-market motion (default unknown)"),
        teardowns: z
          .array(teardownSummarySchema)
          .describe("Teardown summaries: company, channels[], loops[], price_point"),
      },
    },
    async ({ startup, icp, price_point, motion, teardowns }) => {
      const plan = buildDistributionPlan({
        startup,
        icp,
        pricePoint: price_point ?? null,
        motion: (motion ?? "unknown") as Motion,
        teardownSummaries: teardowns.map(toSummary),
      });
      return textResult(envelope(plan, plan.limitations));
    },
  );
};

export { findPricingUrl };
