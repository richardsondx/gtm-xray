import { describe, expect, it } from "vitest";
import {
  buildDistributionPlan,
  type PlanInput,
} from "../src/gtm/distributionPlan.js";

/**
 * Fixed input: a scheduling startup for remote teams, with two teardowns
 * that both invest in SEO/content and PLG loops. The formula is
 * score = icpFit (0-3) + intentLevel (0-2) + competitorProof (0-2) + speedBonus (0-1).
 */
const input: PlanInput = {
  startup: "One-click scheduling for remote teams",
  icp: "Operations managers at remote-first startups with 20-200 people",
  pricePoint: 15,
  motion: "plg",
  teardownSummaries: [
    {
      company: "Cal.com",
      channels: ["SEO / content", "Social (organic)", "Integrations / marketplaces"],
      loops: ["Templates gallery", "Open source as distribution"],
      pricePoint: 15,
    },
    {
      company: "SavvyCal",
      channels: ["SEO / content", "Community"],
      loops: ["Free tools"],
      pricePoint: 12,
    },
  ],
};

describe("distribution plan scoring", () => {
  const plan = buildDistributionPlan(input);

  it("ranks bets by score, highest first", () => {
    const scores = plan.bets.map((b) => b.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("scores SEO/content at 5 for this input", () => {
    // icpFit: 1 keyword hit ("team") -> 1; intentLevel = 2;
    // competitorProof: both teardowns -> 2; speedBonus = 0. Total 5.
    const seo = plan.bets.find((b) => b.channel === "SEO / content");
    expect(seo?.score).toBe(5);
  });

  it("gives competitor proof only to channels seen in teardowns", () => {
    const paid = plan.bets.find((b) => b.channel === "Paid acquisition");
    // "Paid acquisition" appears in no teardown channel list
    expect(paid?.why.join(" ")).not.toContain("Competitor proof");
  });

  it("keeps every bet within the 0-8 range", () => {
    for (const bet of plan.bets) {
      expect(bet.score).toBeGreaterThanOrEqual(0);
      expect(bet.score).toBeLessThanOrEqual(8);
    }
  });

  it("gives outbound a zero ICP fit under a PLG motion", () => {
    const outbound = plan.bets.find((b) => b.channel === "Outbound / sales");
    // icpFit 0 (plg motion not in profile motions) + intent 2 + proof 0 + speed 1 = 3
    expect(outbound?.score).toBe(3);
  });

  it("records limitations when teardowns or price are missing", () => {
    const thin = buildDistributionPlan({
      startup: "x",
      icp: "y",
      pricePoint: null,
      motion: "unknown",
      teardownSummaries: [],
    });
    expect(thin.limitations.length).toBeGreaterThanOrEqual(2);
    expect(thin.limitations.join(" ")).toContain("competitorProof");
  });

  it("every bet has a first experiment and at least one risk", () => {
    for (const bet of plan.bets) {
      expect(bet.firstExperiment.length).toBeGreaterThan(10);
      expect(bet.risks.length).toBeGreaterThan(0);
      expect(bet.why.length).toBeGreaterThan(0);
    }
  });
});
