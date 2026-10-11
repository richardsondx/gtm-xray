/**
 * report.ts: renders teardowns and distribution plans as Markdown or JSON.
 * Markdown teardowns always end with a "What we could not verify" section
 * built from recorded limitations; the renderer never invents evidence.
 */

import type { GtmTeardown } from "./teardown.js";
import type { DistributionPlan } from "./distributionPlan.js";
import type { GtmReportEnvelope } from "./evidence.js";

const conf = (c: string): string => c.toUpperCase();

const evList = (
  evidence: readonly { type: string; url: string; snippet: string }[],
): string => {
  if (evidence.length === 0) return "_No direct evidence recorded._";
  return evidence
    .map((e) => `- [${e.type}] ${e.url || "(site copy)"} : "${e.snippet}"`)
    .join("\n");
};

export const renderTeardownMarkdown = (
  envelope: GtmReportEnvelope<GtmTeardown>,
): string => {
  const t = envelope.findings;
  const lines: string[] = [];

  lines.push(`# GTM Teardown: ${t.company}`);
  lines.push("");
  lines.push(`- Domain: ${t.domain}`);
  lines.push(`- Homepage: ${t.homepageUrl}`);
  lines.push(`- Depth: ${t.depth}`);
  lines.push(`- Generated: ${envelope.generated_at}`);
  lines.push("");

  lines.push("## Snapshot");
  lines.push("");
  lines.push(
    `- Positioning: ${t.positioning.claim} [${conf(t.positioning.confidence)}]`,
  );
  lines.push(
    `- Pricing: ${t.pricing.claim} [${conf(t.pricing.confidence)}]`,
  );
  lines.push(
    `- Channels detected: ${t.channels.length} (${t.channels.map((c) => c.data.channel).join(", ") || "none"})`,
  );
  lines.push(
    `- Acquisition loops detected: ${t.loops.length} (${t.loops.map((l) => l.data.loop).join(", ") || "none"})`,
  );
  lines.push("");

  const p = t.positioning;
  lines.push("## Positioning");
  lines.push("");
  lines.push(`- Claim: ${p.claim} [${conf(p.confidence)}]`);
  lines.push(`- Headline: ${p.data.headline || "(none found)"}`);
  lines.push(`- Subhead: ${p.data.subhead || "(none found)"}`);
  lines.push(`- Category claim: ${p.data.categoryClaim ?? "(none detected)"}`);
  lines.push(
    `- Audience signals: ${p.data.audienceSignals.join(", ") || "(none detected)"}`,
  );
  lines.push(
    `- Social proof types: ${p.data.socialProof.join(", ") || "(none detected)"}`,
  );
  lines.push("");
  lines.push("Evidence:");
  lines.push(evList(p.evidence));
  lines.push("");

  const pr = t.pricing;
  lines.push("## Pricing");
  lines.push("");
  lines.push(`- Claim: ${pr.claim} [${conf(pr.confidence)}]`);
  lines.push(
    `- Billing model: ${pr.data.billingModel}; free trial: ${pr.data.hasFreeTrial ? "yes" : "no"}; freemium: ${pr.data.hasFreemium ? "yes" : "no"}`,
  );
  if (pr.data.plans.length > 0) {
    lines.push("- Plans:");
    for (const plan of pr.data.plans) {
      lines.push(
        `  - ${plan.planName}: ${plan.monthly !== null ? `${plan.currency}${plan.monthly}/mo` : "price n/a"}${plan.annualMonthly !== null ? ` (${plan.currency}${plan.annualMonthly}/mo annual)` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("Evidence:");
  lines.push(evList(pr.evidence));
  lines.push("");

  lines.push("## Channels");
  lines.push("");
  if (t.channels.length === 0) {
    lines.push("_No channel signals detected._");
  } else {
    lines.push("| Channel | Signal | Confidence | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of t.channels) {
      const ev = c.evidence
        .map((e) => `${e.url || "(site)"}`)
        .join("<br>");
      lines.push(
        `| ${c.data.channel} | ${c.data.signal} | ${conf(c.confidence)} | ${ev || "none"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Acquisition loops");
  lines.push("");
  if (t.loops.length === 0) {
    lines.push("_No acquisition loops detected._");
  } else {
    for (const l of t.loops) {
      lines.push(`- **${l.data.loop}** [${conf(l.confidence)}]: ${l.data.description}`);
      lines.push(evList(l.evidence));
    }
  }
  lines.push("");

  lines.push("## What we could not verify");
  lines.push("");
  if (t.limitations.length === 0) {
    lines.push("_No recorded limitations._");
  } else {
    for (const lim of t.limitations) lines.push(`- ${lim}`);
  }
  lines.push("");

  return lines.join("\n");
};

export const renderPlanMarkdown = (
  envelope: GtmReportEnvelope<DistributionPlan>,
): string => {
  const plan = envelope.findings;
  const lines: string[] = [];

  lines.push(`# Distribution Plan: ${plan.startup}`);
  lines.push("");
  lines.push(`- ICP: ${plan.icp}`);
  lines.push(`- Generated: ${envelope.generated_at}`);
  lines.push("");

  lines.push("## Ranked channel bets");
  lines.push("");
  lines.push(
    "Score = icpFit (0-3) + intentLevel (0-2) + competitorProof (0-2) + speedBonus (0-1). See docs/methodology.md.",
  );
  lines.push("");
  plan.bets.forEach((bet, i) => {
    lines.push(`### ${i + 1}. ${bet.channel} (score ${bet.score}/8)`);
    lines.push("");
    lines.push(`- Cost: ${bet.expectedCost}; time to signal: ${bet.timeToSignal}`);
    lines.push("- Why:");
    for (const w of bet.why) lines.push(`  - ${w}`);
    lines.push(`- First experiment: ${bet.firstExperiment}`);
    lines.push("- Risks:");
    for (const r of bet.risks) lines.push(`  - ${r}`);
    lines.push("");
  });

  lines.push("## What we could not verify");
  lines.push("");
  if (plan.limitations.length === 0) {
    lines.push("_No recorded limitations._");
  } else {
    for (const lim of plan.limitations) lines.push(`- ${lim}`);
  }
  lines.push("");

  return lines.join("\n");
};

export const renderJson = (envelope: GtmReportEnvelope<unknown>): string =>
  JSON.stringify(envelope, null, 2);
