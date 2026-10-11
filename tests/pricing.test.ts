import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPage } from "../src/gtm/extract.js";
import { analyzePricing } from "../src/gtm/pricing.js";

const pricingPage = extractPage(
  readFileSync(join(__dirname, "fixtures", "acme-pricing.html"), "utf8"),
  "https://acme.test/pricing",
);

describe("pricing heuristics", () => {
  const finding = analyzePricing(pricingPage, "https://acme.test/pricing");

  it("finds dollar prices in the copy", () => {
    expect(finding.claim).toContain("$12");
    expect(finding.data.plans.length).toBeGreaterThan(0);
  });

  it("detects per-seat billing", () => {
    expect(finding.data.billingModel).toBe("per-seat");
  });

  it("detects the free trial and the free tier", () => {
    expect(finding.data.hasFreeTrial).toBe(true);
    expect(finding.data.hasFreemium).toBe(true);
  });

  it("marks a price-less page low confidence instead of guessing", () => {
    const empty = extractPage(
      `<html><head><title>Pricing</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>`,
      "https://acme.test/pricing",
    );
    const f = analyzePricing(empty, "https://acme.test/pricing");
    expect(f.confidence).toBe("low");
    expect(f.limitations.length).toBeGreaterThan(0);
    expect(f.data.plans).toEqual([]);
  });

  it("detects usage-based billing", () => {
    const usage = extractPage(
      `<html><body><h1>Pricing</h1><p>$49 per 1,000 events. Pay as you go.</p></body></html>`,
      "https://acme.test/pricing",
    );
    const f = analyzePricing(usage, "https://acme.test/pricing");
    expect(f.data.billingModel).toBe("usage");
  });
});
