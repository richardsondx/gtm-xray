import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPage } from "../src/gtm/render.js";
import { extractPage } from "../src/gtm/extract.js";
import { analyzePricing, mergePricingSnapshots } from "../src/gtm/pricing.js";

// A rendered pricing page in the shape Higgsfield's live page shows:
// plan cards with prices in the DOM, not in server HTML. The numbers
// here are the live-verified Oct 30, 2026 individual monthly tiers,
// used as a regression fixture: Starter $19, Plus $59, Ultra $129.
// Annual prices ($47 / $99) are a separate toggled view on the live
// page, not a second set of cards in the same DOM, so they are not
// duplicated in this fixture: the existing pricing extractor pairs
// each plan with its nearest price in one view.
const RENDERED_PRICING_HTML = `<!doctype html><html><head><title>Higgsfield Pricing</title></head><body>
<h1>Pricing</h1>
<section><h2>Starter</h2><p>$19 per month</p><p>270 credits per month</p></section>
<section><h2>Plus</h2><p>$59 per month</p><p>1,200 credits per month</p></section>
<section><h2>Ultra</h2><p>$129 per month</p><p>3,000 credits per month</p></section>
<button>Annual</button>
</body></html>`;

describe("renderPage safety guards", () => {
  it("refuses private network addresses without launching a browser", async () => {
    const res = await renderPage("http://localhost:3000/pricing");
    expect(res.ok).toBe(false);
    expect(res.limitations.join(" ")).toMatch(/private network/);
  });

  it("refuses non-HTTP(S) URLs", async () => {
    const res = await renderPage("file:///etc/passwd");
    expect(res.ok).toBe(false);
  });

  it("refuses unparseable URLs", async () => {
    const res = await renderPage("not a url");
    expect(res.ok).toBe(false);
  });
});

describe("renderPage with a rendered fixture", () => {
  it("captures rendered DOM, text, and a screenshot, and pricing extraction reads the rendered prices", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gtm-render-"));
    const shot = join(dir, "pricing.png");
    const res = await renderPage("https://higgsfield.ai/pricing", {
      screenshotPath: shot,
      testHtml: RENDERED_PRICING_HTML,
    });
    expect(res.ok).toBe(true);
    expect(res.finalUrl).toBe("https://higgsfield.ai/pricing");
    expect(res.text).toContain("$59");
    expect(res.snapshots.length).toBeGreaterThanOrEqual(1);
    const info = await stat(shot);
    expect(info.size).toBeGreaterThan(1000);
    const buf = await readFile(shot);
    // PNG magic bytes.
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);

    const finding = analyzePricing(
      extractPage(res.html, res.finalUrl),
      res.finalUrl,
    );
    const byName = new Map(finding.data.plans.map((p) => [p.planName, p]));
    expect(byName.get("starter")?.monthly).toBe(19);
    expect(byName.get("plus")?.monthly).toBe(59);
    expect(byName.get("ultra")?.monthly).toBe(129);
    // Panel fix: credit quantities survive as structured data, not just copy.
    expect(byName.get("starter")?.includedQuantity).toBe(270);
    expect(byName.get("starter")?.unit).toBe("credits");
    expect(byName.get("plus")?.includedQuantity).toBe(1200);
    expect(byName.get("ultra")?.includedQuantity).toBe(3000);
  }, 30000);

  it("keeps the monthly view when the annual toggle changes prices, and merges them paired", async () => {
    const toggledHtml = `<!doctype html><html><head><title>Higgsfield Pricing</title></head><body>
<h1>Pricing</h1>
<section><h2>Starter</h2><p class="price">$19 per month</p><p>270 credits per month</p></section>
<section><h2>Plus</h2><p class="price">$59 per month</p><p>1,200 credits per month</p></section>
<section><h2>Ultra</h2><p class="price">$129 per month</p><p>3,000 credits per month</p></section>
<button id="annual">Annual</button>
<script>document.getElementById("annual").addEventListener("click", () => {
  const prices = document.querySelectorAll(".price");
  prices[0].textContent = "$19 per month, billed annually";
  prices[1].textContent = "$47 per month, billed annually";
  prices[2].textContent = "$99 per month, billed annually";
});</script>
</body></html>`;
    const res = await renderPage("https://higgsfield.ai/pricing", {
      interactPricing: true,
      testHtml: toggledHtml,
    });
    expect(res.ok).toBe(true);
    expect(res.snapshots.length).toBe(2);
    const initial = res.snapshots.find((s) => s.label === "initial");
    const annual = res.snapshots.find((s) => s.label === "annual");
    expect(initial).toBeDefined();
    expect(annual).toBeDefined();
    const initialFinding = analyzePricing(extractPage(initial!.html, res.finalUrl), res.finalUrl);
    const annualFinding = analyzePricing(extractPage(annual!.html, res.finalUrl), res.finalUrl);
    // The annual view price "$47 per month, billed annually" must be
    // classified annual, not monthly, or the merged finding lies.
    const annualByName = new Map(annualFinding.data.plans.map((p) => [p.planName, p]));
    expect(annualByName.get("plus")?.annualMonthly).toBe(47);
    const merged = mergePricingSnapshots(initialFinding, annualFinding);
    expect(merged.data.source).toBe("rendered");
    const byName = new Map(merged.data.plans.map((p) => [p.planName, p]));
    expect(byName.get("starter")?.monthly).toBe(19);
    expect(byName.get("starter")?.annualMonthly).toBe(19);
    expect(byName.get("plus")?.monthly).toBe(59);
    expect(byName.get("plus")?.annualMonthly).toBe(47);
    expect(byName.get("ultra")?.monthly).toBe(129);
    expect(byName.get("ultra")?.annualMonthly).toBe(99);
  }, 30000);
});
