/**
 * distributionPlan.ts: turns teardown summaries into ranked channel bets for
 * a new startup. The ranking formula is documented in docs/methodology.md and
 * tested against a fixed input in tests/distributionPlan.test.ts.
 *
 * score = icpFit (0-3) + intentLevel (0-2) + competitorProof (0-2) + speedBonus (0-1)
 */

import { nowIso } from "./evidence.js";

export type Motion = "plg" | "sales" | "hybrid" | "unknown";
export type Cost = "free" | "low" | "medium" | "high";
export type TimeToSignal = "days" | "weeks" | "months";

export interface TeardownSummary {
  readonly company: string;
  readonly channels: readonly string[];
  readonly loops: readonly string[];
  readonly pricePoint: number | null;
}

export interface PlanInput {
  readonly startup: string;
  readonly icp: string;
  readonly pricePoint: number | null;
  readonly motion: Motion;
  readonly teardownSummaries: readonly TeardownSummary[];
}

export interface ChannelBet {
  readonly channel: string;
  readonly score: number;
  readonly why: readonly string[];
  readonly expectedCost: Cost;
  readonly timeToSignal: TimeToSignal;
  readonly firstExperiment: string;
  readonly risks: readonly string[];
}

export interface DistributionPlan {
  readonly startup: string;
  readonly icp: string;
  readonly bets: readonly ChannelBet[];
  readonly limitations: readonly string[];
}

/**
 * Candidate channels with their intrinsic properties. intentLevel and
 * speedBonus are fixed by the channel's nature; icpFit and competitorProof
 * are computed per input.
 */
interface ChannelProfile {
  readonly channel: string;
  readonly intentLevel: 0 | 1 | 2;
  readonly speedBonus: 0 | 1;
  readonly expectedCost: Cost;
  readonly timeToSignal: TimeToSignal;
  readonly firstExperiment: string;
  readonly risks: readonly string[];
  /** Keywords matched (case-insensitive) against the ICP + startup one-liner for icpFit. */
  readonly icpKeywords: readonly string[];
  /** Motions this channel serves well. */
  readonly motions: readonly Motion[];
}

const CHANNEL_PROFILES: readonly ChannelProfile[] = [
  {
    channel: "SEO / content",
    intentLevel: 2,
    speedBonus: 0,
    expectedCost: "low",
    timeToSignal: "months",
    firstExperiment:
      "Publish 5 bottom-of-funnel posts answering the exact queries your ICP already searches (vs pages from the teardown).",
    risks: ["Takes months to compound", "Needs consistent publishing cadence"],
    icpKeywords: ["developer", "engineer", "marketer", "founder", "team", "search", "google"],
    motions: ["plg", "hybrid", "unknown"],
  },
  {
    channel: "Social (organic)",
    intentLevel: 1,
    speedBonus: 1,
    expectedCost: "free",
    timeToSignal: "weeks",
    firstExperiment:
      "Post one teardown-style breakdown of a competitor's funnel per week on the platform where your ICP hangs out; link the signup.",
    risks: ["Algorithm-dependent reach", "Easy to burn time with no pipeline"],
    icpKeywords: ["founder", "creator", "indie", "developer", "marketer"],
    motions: ["plg", "hybrid", "unknown"],
  },
  {
    channel: "Community",
    intentLevel: 1,
    speedBonus: 1,
    expectedCost: "free",
    timeToSignal: "weeks",
    firstExperiment:
      "Answer 10 real questions per week in 2 communities your ICP already uses; link your product only where it directly solves the asked problem.",
    risks: ["Communities ban self-promotion fast", "Slow to scale"],
    icpKeywords: ["developer", "engineer", "founder", "indie", "creator"],
    motions: ["plg", "hybrid", "unknown"],
  },
  {
    channel: "Integrations / marketplaces",
    intentLevel: 2,
    speedBonus: 0,
    expectedCost: "low",
    timeToSignal: "months",
    firstExperiment:
      "Ship one integration with the tool your ICP already pays for, then list in that tool's directory.",
    risks: ["Directory approval can stall", "Each integration is maintenance"],
    icpKeywords: ["team", "developer", "engineer", "workflow", "stack"],
    motions: ["plg", "hybrid", "unknown"],
  },
  {
    channel: "PLG loops (free tools / templates)",
    intentLevel: 2,
    speedBonus: 0,
    expectedCost: "low",
    timeToSignal: "weeks",
    firstExperiment:
      "Ship one free single-purpose tool that does 10% of the product and gates the rest behind signup.",
    risks: ["Free users may never convert", "Tool maintenance without revenue"],
    icpKeywords: ["developer", "founder", "marketer", "creator", "free"],
    motions: ["plg", "hybrid"],
  },
  {
    channel: "Outbound / sales",
    intentLevel: 2,
    speedBonus: 1,
    expectedCost: "medium",
    timeToSignal: "weeks",
    firstExperiment:
      "Hand-write 25 personalized emails to ICP accounts referencing a specific observable trigger; measure reply rate.",
    risks: ["Burns domain reputation if sprayed", "Needs a repeatable list source"],
    icpKeywords: ["enterprise", "sales", "team", "b2b", "company"],
    motions: ["sales", "hybrid"],
  },
  {
    channel: "Affiliates / referrals",
    intentLevel: 1,
    speedBonus: 0,
    expectedCost: "low",
    timeToSignal: "months",
    firstExperiment:
      "Offer 10 power users 30% recurring commission for referrals; write the program page before recruiting.",
    risks: ["Attracts low-quality affiliates without vetting", "Needs volume to matter"],
    icpKeywords: ["creator", "agency", "consultant", "founder"],
    motions: ["plg", "hybrid", "unknown"],
  },
  {
    channel: "Paid acquisition",
    intentLevel: 2,
    speedBonus: 1,
    expectedCost: "high",
    timeToSignal: "days",
    firstExperiment:
      "Run a $200 test on one high-intent keyword cluster; kill it unless signup CAC lands under 1/3 of expected LTV.",
    risks: ["Expensive to learn", "Stops the day you stop paying"],
    icpKeywords: ["b2b", "enterprise", "team", "search"],
    motions: ["plg", "sales", "hybrid", "unknown"],
  },
  {
    channel: "Agent surfaces (llms.txt / MCP)",
    intentLevel: 1,
    speedBonus: 1,
    expectedCost: "free",
    timeToSignal: "weeks",
    firstExperiment:
      "Ship llms.txt and a minimal MCP server wrapping your core action; register in one MCP directory.",
    risks: ["Channel is early; volume is unproven", "Standards still shifting"],
    icpKeywords: ["developer", "engineer", "ai", "agent"],
    motions: ["plg", "hybrid", "unknown"],
  },
];

const icpFit = (profile: ChannelProfile, input: PlanInput): 0 | 1 | 2 | 3 => {
  const haystack = `${input.icp} ${input.startup}`.toLowerCase();
  const hits = profile.icpKeywords.filter((k) => haystack.includes(k)).length;
  const motionOk = profile.motions.includes(input.motion) || input.motion === "unknown";
  if (!motionOk) return 0;
  if (hits >= 3) return 3;
  if (hits === 2) return 2;
  if (hits === 1) return 1;
  return 1; // motion-compatible channels get a floor of 1
};

const competitorProof = (
  profile: ChannelProfile,
  summaries: readonly TeardownSummary[],
): 0 | 1 | 2 => {
  if (summaries.length === 0) return 0;
  const name = profile.channel.toLowerCase();
  let count = 0;
  for (const s of summaries) {
    const channels = s.channels.map((c) => c.toLowerCase());
    const loops = s.loops.map((l) => l.toLowerCase());
    if (channels.some((c) => c.includes(name) || name.includes(c))) count += 1;
    // PLG loops profile maps to teardown loop names
    if (
      profile.channel.startsWith("PLG") &&
      loops.some((l) => /free tool|template|referral|share|open source|api/i.test(l))
    )
      count += 1;
  }
  if (count >= 2) return 2;
  if (count === 1) return 1;
  return 0;
};

export const buildDistributionPlan = (input: PlanInput): DistributionPlan => {
  const limitations: string[] = [];
  if (input.teardownSummaries.length === 0) {
    limitations.push(
      "No teardown summaries provided; competitorProof scores are all 0, so rankings lean on ICP fit and channel speed alone.",
    );
  }
  if (input.pricePoint === null) {
    limitations.push(
      "No price point given; cost expectations assume a sub-$100/mo self-serve product. Adjust paid-channel bets if the price is higher.",
    );
  }
  if (input.motion === "unknown") {
    limitations.push(
      "Motion is unknown; channels were scored as motion-compatible with a floor icpFit of 1.",
    );
  }

  const bets: ChannelBet[] = CHANNEL_PROFILES.map((profile) => {
    const fit = icpFit(profile, input);
    const proof = competitorProof(profile, input.teardownSummaries);
    const score = fit + profile.intentLevel + proof + profile.speedBonus;

    const why: string[] = [];
    const name = profile.channel.toLowerCase();
    const proving = input.teardownSummaries.filter((s) =>
      s.channels.some((c) => {
        const cLow = c.toLowerCase();
        return cLow.includes(name) || name.includes(cLow);
      }),
    );
    if (proving.length > 0) {
      why.push(
        `Competitor proof: ${proving.map((p) => p.company).join(", ")} invest${proving.length === 1 ? "s" : ""} in ${profile.channel.toLowerCase()} (seen in teardown).`,
      );
    }
    if (fit >= 2) {
      why.push(
        `ICP fit: the channel reaches buyers like "${input.icp.slice(0, 80)}" where they already spend attention.`,
      );
    }
    why.push(
      profile.intentLevel === 2
        ? "High intent: prospects arriving here are actively looking for a solution."
        : "Medium intent: reaches prospects before they start searching; needs a hook.",
    );
    if (profile.speedBonus === 1) {
      why.push("Fast signal: you can read results in days to weeks, not quarters.");
    }

    return {
      channel: profile.channel,
      score,
      why: why.slice(0, 3),
      expectedCost: profile.expectedCost,
      timeToSignal: profile.timeToSignal,
      firstExperiment: profile.firstExperiment,
      risks: profile.risks,
    };
  })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || a.channel.localeCompare(b.channel));

  return {
    startup: input.startup,
    icp: input.icp,
    bets,
    limitations,
  };
};
