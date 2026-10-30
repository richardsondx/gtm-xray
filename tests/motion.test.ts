import { describe, it, expect } from "vitest";
import { analyzeMotion } from "../src/gtm/motion.js";
import type { Pricing } from "../src/gtm/pricing.js";

const pricing = (hasFreemium: boolean, hasFreeTrial: boolean): any => ({
  claim: "",
  confidence: "medium" as const,
  data: {
    plans: [],
    hasFreeTrial,
    trialDays: null,
    hasFreemium,
    billingModel: "unknown" as const,
    pricingPageFound: true,
    pricingPageUrl: "https://example.com/pricing",
    source: "fetch" as const,
  } satisfies Pricing,
  evidence: [],
  limitations: [],
});

describe("analyzeMotion", () => {
  it("infers self-serve from a Start free call to action and a free tier", () => {
    const f = analyzeMotion(
      [{ href: "https://example.com/signup", text: "Start free", cls: "internal" as const }],
      pricing(true, false),
      "https://example.com",
    );
    expect(f.data.motion).toBe("self-serve");
    expect(f.data.primaryCta).toBe("Start free");
    expect(f.data.signupUrl).toBe("https://example.com/signup");
  });

  it("infers hybrid when both self-serve and demo signals are present", () => {
    const f = analyzeMotion(
      [
        { href: "https://example.com/signup", text: "Start free", cls: "internal" as const },
        { href: "https://example.com/demo", text: "Book a demo", cls: "internal" as const },
      ],
      pricing(false, false),
      "https://example.com",
    );
    expect(f.data.motion).toBe("hybrid");
    expect(f.data.demoUrl).toBe("https://example.com/demo");
  });

  it("does not guess when no motion signal is found", () => {
    const f = analyzeMotion(
      [{ href: "https://example.com/about", text: "About", cls: "internal" as const }],
      pricing(false, false),
      "https://example.com",
    );
    expect(f.data.motion).toBe("unknown");
    expect(f.confidence).toBe("low");
  });
});
