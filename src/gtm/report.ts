/**
 * report.ts: renders teardowns and distribution plans as Markdown or JSON.
 * Markdown teardowns always end with a "What we could not verify" section
 * built from recorded limitations; the renderer never invents evidence.
 */

import type { GtmTeardown } from "./teardown.js";
import type { DistributionPlan } from "./distributionPlan.js";
import type { GtmReportEnvelope } from "./evidence.js";

/**
 * Panel fix, Oct 30: HIGH / MEDIUM / LOW badges meant nothing to a
 * GTM head and did not change what they should do. Plain words say
 * what the confidence actually means: seen directly on the page,
 * inferred from a link, or not verified.
 */
const conf = (c: string): string =>
  c === "high" ? "Seen directly" : c === "medium" ? "Inferred" : "Not verified";

const confRank = (c: string): number =>
  c === "high" ? 0 : c === "medium" ? 1 : 2;

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
  lines.push(`- Generated: ${envelope.generated_at}`);
  lines.push("");

  // Verdict first, panel fix: a GTM head decides from the top three
  // bullets, then reads down for proof. Counts are not insight.
  const rankedChannels = [...t.channels].sort(
    (a, b) => confRank(a.confidence) - confRank(b.confidence),
  );
  const topChannel = rankedChannels[0];
  const pricedPlans = t.pricing.data.plans.filter(
    (p) => p.monthly !== null || p.annualMonthly !== null,
  );
  lines.push("## Verdict: how they win, in three bullets");
  lines.push("");
  lines.push(
    `- ${t.motion ? t.motion.claim : "Motion not assessed"} [${t.motion ? conf(t.motion.confidence) : "Not verified"}]`,
  );
  lines.push(
    `- Strongest customer channel: ${topChannel ? `${topChannel.data.channel}, ${topChannel.data.signal}` : "No channel signal found"}${topChannel?.evidence[0]?.url ? `, see ${topChannel.evidence[0].url}` : ""}`,
  );
  lines.push(
    `- Pricing at a glance: ${pricedPlans.length > 0 ? pricedPlans.map((p) => `${p.planName} ${p.currency}${p.monthly ?? p.annualMonthly}${p.includedQuantity !== null && p.unit ? `, ${p.includedQuantity} ${p.unit}` : ""}`).join("; ") : "No priced plans found"} (source: ${t.pricing.data.source === "rendered" ? "rendered page" : "fetched page"})`,
  );
  lines.push(
    `- Who they sell to: ${t.positioning.data.audienceSignals.join(", ") || "Audience not clear from the homepage"}; headline: "${t.positioning.data.headline || "Not found"}"`,
  );
  lines.push(
    `- What to copy first: ${t.loops[0] ? `${t.loops[0].data.loop}, ${t.loops[0].data.description.replace(" ()", "")}` : topChannel ? `${topChannel.data.channel} as above` : "No loop or channel to copy from this teardown"}`,
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
    `- Source: ${pr.data.source === "rendered" ? "rendered page (what a visitor sees)" : "fetched page (server HTML)"}; billing model: ${pr.data.billingModel}; free trial: ${pr.data.hasFreeTrial ? "yes" : "no"}${pr.data.trialDays !== null ? ` (${pr.data.trialDays} days)` : ""}; free version: ${pr.data.hasFreemium ? "yes" : "no"}`,
  );
  if (pr.data.plans.length > 0) {
    lines.push("- Plans:");
    for (const plan of pr.data.plans) {
      lines.push(
        `  - ${plan.planName}: ${plan.monthly !== null ? `${plan.currency}${plan.monthly}/mo` : "Not found"}${plan.annualMonthly !== null ? ` (${plan.currency}${plan.annualMonthly}/mo annual)` : ""}${plan.includedQuantity !== null && plan.unit ? `, includes ${plan.includedQuantity} ${plan.unit}` : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("Evidence:");
  lines.push(evList(pr.evidence));
  lines.push("");

  lines.push("## Channels, strongest proof first");
  lines.push("");
  if (t.channels.length === 0) {
    lines.push("_No channel signals detected._");
  } else {
    lines.push("| Channel | Signal | Confidence | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of rankedChannels) {
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

  lines.push("## What to try next, starting points only");
  lines.push("");
  lines.push(
    "These are starting points tied to the channels above, not proven results. Presence is not performance: a channel existing does not prove it brings customers.",
  );
  if (rankedChannels.length === 0) {
    lines.push("- No channel was found to base an experiment on. Start with a competitor that has a clearer channel footprint.");
  } else {
    rankedChannels.slice(0, 3).forEach((c, i) => {
      const url = c.evidence[0]?.url ?? t.homepageUrl;
      lines.push(
        `- Experiment ${i + 1}: copy the ${c.data.channel} move at ${url}. First step: study that page and ship one comparable artifact. Signal to watch: signups attributed to that channel in 4 to 8 weeks. Kill it if it brings no qualified signups in that window.`,
      );
    });
  }
  lines.push("");
  lines.push(
    "- What not to copy blindly: a linked social profile is not an active channel, and a large sitemap is not proof that search brings signups. Check activity and ranking before investing.",
  );
  lines.push("");

  lines.push("## What we could not verify");
  lines.push("");
  lines.push(
    "Paid spend, traffic, conversion rate, CAC, true channel mix, and profitability cannot be told from public pages alone. They are unknown, not zero.",
  );
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

  lines.push("## Start here: first 3 bets, in order");
  lines.push("");
  if (plan.bets.length === 0) {
    lines.push("_No bets generated._");
  } else {
    plan.bets.slice(0, 3).forEach((bet, i) => {
      lines.push(`- ${i + 1}. ${bet.channel} (score ${bet.score}/8, cost ${bet.expectedCost}, time to signal ${bet.timeToSignal})`);
    });
    lines.push(
      "- The rest below are later, not now. Do not start all bets at once; run the first 3, kill on their signals, then take the next one.",
    );
  }
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
