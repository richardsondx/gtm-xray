/**
 * render.ts: rendered evidence, board item 1, built narrowly.
 *
 * The fetch-only path reads server HTML. Some sites, Higgsfield's pricing
 * page is the proven case, render their prices in JavaScript, so server
 * HTML contains zero prices. This module loads a page in a real Chromium
 * browser via Playwright and captures what a visitor actually sees:
 * rendered DOM, visible text, a screenshot, network requests (HAR-like),
 * installed analytics and affiliate tooling, and, on pricing pages, the
 * result of clicking an annual billing toggle when one exists.
 *
 * It never throws on a browser failure. A failure is returned as data
 * with a limitation, so callers can fall back to the fetch-only result
 * and say exactly why rendered evidence is missing.
 *
 * Safety: private network addresses (localhost, RFC 1918, link-local)
 * are refused outright, so a teardown target cannot make the browser
 * probe the machine running gtm-xray. No purchase, form submission, or
 * sign-in is ever attempted. The annual toggle click is a read-only
 * view change on the pricing page.
 */

import { chromium } from "playwright";
import { BROWSER_UA } from "./fetch.js";
import { nowIso } from "./evidence.js";

export interface RenderNetworkEntry {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly resourceType: string;
  readonly contentType: string;
}

export interface RenderSnapshot {
  readonly label: "initial" | "annual";
  readonly html: string;
  readonly text: string;
  readonly title: string;
}

export interface RenderResult {
  readonly ok: boolean;
  readonly url: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly title: string;
  readonly html: string;
  readonly text: string;
  readonly screenshotPath: string | null;
  readonly annualScreenshotPath: string | null;
  readonly network: readonly RenderNetworkEntry[];
  readonly detectedTags: readonly string[];
  readonly detectedAffiliateTools: readonly string[];
  readonly snapshots: readonly RenderSnapshot[];
  readonly limitations: readonly string[];
  readonly renderedAt: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly error: string | null;
}

export interface RenderOptions {
  readonly viewport?: { width: number; height: number };
  readonly timeoutMs?: number;
  readonly screenshotPath?: string;
  readonly interactPricing?: boolean;
  /**
   * Test seam only, never passed by the CLI. When set, the browser loads
   * about:blank and sets this HTML instead of navigating, so rendered
   * extraction and screenshots can be tested where live navigation is
   * blocked (for example, in a sandbox with no external browser egress).
   */
  readonly testHtml?: string;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

const TAG_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Panel fix: the old GTM pattern matched any googletagmanager.com URL,
  // so one gtag script produced both "Google Tag Manager" and "Google
  // Analytics / gtag". GTM is only gtm.js; gtag is only gtag/js.
  [/googletagmanager\.com\/gtm\.js/i, "Google Tag Manager"],
  [/google-analytics\.com|googletagmanager\.com\/gtag\/js/i, "Google Analytics / gtag"],
  [/connect\.facebook\.net/i, "Meta Pixel"],
  [/snap\.licdn\.com/i, "LinkedIn Insight Tag"],
  [/analytics\.tiktok\.com/i, "TikTok Pixel"],
  [/cdn\.segment\.com/i, "Segment"],
  [/bat\.bing\.com/i, "Microsoft Clarity / Bing UET"],
  [/js\.hs-analytics\.net|js\.hsforms\.net/i, "HubSpot"],
  [/cdn\.heapanalytics\.com/i, "Heap"],
  [/cdn\.mixpanel\.com|mixpanel/i, "Mixpanel"],
  [/cdn\.posthog\.com|posthog/i, "PostHog"],
];

const AFFILIATE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/rewardful/i, "Rewardful"],
  [/partnerstack/i, "PartnerStack"],
  [/firstpromoter/i, "FirstPromoter"],
  [/impact\.com|impact\.com/i, "Impact"],
  [/referralcandy/i, "ReferralCandy"],
  [/tapfiliate/i, "Tapfiliate"],
  [/affiliatly/i, "Affiliatly"],
];

const isPrivateHostname = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h === "::1" || h === "[::1]") return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
};

const detect = (
  patterns: ReadonlyArray<readonly [RegExp, string]>,
  haystacks: readonly string[],
): string[] => {
  const found = new Set<string>();
  for (const [re, label] of patterns) {
    if (haystacks.some((h) => re.test(h))) found.add(label);
  }
  return [...found];
};

export const renderPage = async (
  rawUrl: string,
  opts: RenderOptions = {},
): Promise<RenderResult> => {
  const viewport = opts.viewport ?? DEFAULT_VIEWPORT;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const renderedAt = nowIso();
  const fail = (error: string, limitations: string[]): RenderResult => ({
    ok: false,
    url: rawUrl,
    finalUrl: rawUrl,
    status: 0,
    title: "",
    html: "",
    text: "",
    screenshotPath: null,
    annualScreenshotPath: null,
    network: [],
    detectedTags: [],
    detectedAffiliateTools: [],
    snapshots: [],
    limitations,
    renderedAt,
    viewport,
    error,
  });

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return fail(`Could not parse URL: ${rawUrl}`, [`Could not parse URL: ${rawUrl}`]);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fail(`Refusing non-HTTP(S) URL: ${target.protocol}`, [
      `Rendered capture refuses non-HTTP(S) URLs (${target.protocol}).`,
    ]);
  }
  if (isPrivateHostname(target.hostname)) {
    return fail(`Refusing private network address: ${target.hostname}`, [
      `Rendered capture refuses private network addresses (${target.hostname}); it cannot probe the machine running gtm-xray.`,
    ]);
  }

  const network: RenderNetworkEntry[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      viewport,
      userAgent: BROWSER_UA,
      locale: "en-US",
    });
    const page = await context.newPage();
    page.on("response", (res) => {
      if (network.length >= 500) return;
      try {
        network.push({
          url: res.url(),
          method: res.request().method(),
          status: res.status(),
          resourceType: res.request().resourceType(),
          contentType: (res.headers()["content-type"] ?? "").toLowerCase(),
        });
      } catch {
        // A single network entry must never break the capture.
      }
    });

    let response: Awaited<ReturnType<typeof page.goto>> = null;
    let networkIdleTimedOut = false;
    if (opts.testHtml !== undefined) {
      await page.goto("about:blank");
      await page.setContent(opts.testHtml);
    } else {
      response = await page.goto(target.toString(), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      try {
        await page.waitForLoadState("networkidle", { timeout: 8_000 });
      } catch {
        networkIdleTimedOut = true;
      }
    }
    try {
      await page.waitForTimeout(1_000);
    } catch {
      // Ignore; the snapshot below is still taken.
    }

    const takeSnapshot = async (label: RenderSnapshot["label"]): Promise<RenderSnapshot> => ({
      label,
      html: await page.content(),
      text: await page.evaluate(() => (document.body ? document.body.innerText : "")),
      title: await page.title(),
    });

    const initial = await takeSnapshot("initial");
    const snapshots: RenderSnapshot[] = [initial];
    const initialUrl = opts.testHtml !== undefined ? target.toString() : page.url();

    let screenshotPath: string | null = null;
    let annualScreenshotPath: string | null = null;
    if (opts.screenshotPath) {
      await page.screenshot({ path: opts.screenshotPath, fullPage: true });
      screenshotPath = opts.screenshotPath;
    }

    // Pricing toggles: if an annual billing control exists, click it and
    // capture the toggled view as a second, labelled snapshot. Monthly
    // prices are usually visible in the initial view; annual prices are
    // the ones fetch-only and initial-render views most often miss.
    // Panel fix: the old code kept the annual snapshot even when the
    // click changed nothing (a nav link or FAQ that happens to contain
    // the word "annual"). Now the snapshot is kept only when visible
    // text actually changed, and it gets its own screenshot.
    let annualToggleDiscarded = false;
    if (opts.interactPricing) {
      try {
        const toggle = page
          .locator('button, a, [role="tab"], [role="button"]')
          .filter({ hasText: /annual|yearly|billed annually/i })
          .first();
        if (await toggle.count()) {
          await toggle.click({ timeout: 3_000 });
          await page.waitForTimeout(1_200);
          const annual = await takeSnapshot("annual");
          if (annual.text.trim() === initial.text.trim()) {
            annualToggleDiscarded = true;
          } else {
            snapshots.push(annual);
            if (opts.screenshotPath) {
              const annualPath = /\.([a-zA-Z0-9]+)$/.test(opts.screenshotPath)
                ? opts.screenshotPath.replace(/\.([a-zA-Z0-9]+)$/, "-annual.$1")
                : `${opts.screenshotPath}-annual.png`;
              await page.screenshot({ path: annualPath, fullPage: true });
              annualScreenshotPath = annualPath;
            }
          }
        }
      } catch {
        // No usable annual toggle: the initial snapshot stands, and no
        // limitation is invented for a control that may not exist.
      }
    }

    const finalUrl = initialUrl;
    const latest = snapshots[snapshots.length - 1] ?? initial;
    // Panel fix: tags used to be detected from full HTML as well, so a
    // blog mention of Segment or a commented script counted as an
    // installed tool. Now only network requests that returned 2xx count,
    // and the result is labelled "request observed, use not proven" by
    // callers, because a script loading does not prove ads work.
    const successfulUrls = network
      .filter((n) => n.status >= 200 && n.status < 300)
      .map((n) => n.url);
    const limitations: string[] = [];
    if (networkIdleTimedOut) {
      limitations.push(
        "Page did not reach network idle within 8 seconds; the rendered snapshot may be incomplete.",
      );
    }
    if (annualToggleDiscarded) {
      limitations.push(
        "Annual toggle click did not change visible text; annual snapshot discarded, monthly view stands.",
      );
    }
    if (response && !response.ok()) {
      limitations.push(
        `Rendered page returned HTTP ${response.status()}; the snapshot may be an error page, not the pricing page.`,
      );
    }
    return {
      ok: true,
      url: rawUrl,
      finalUrl,
      status: response?.status() ?? 0,
      title: latest.title,
      html: latest.html,
      text: latest.text,
      screenshotPath,
      annualScreenshotPath,
      network,
      detectedTags: detect(TAG_PATTERNS, successfulUrls),
      detectedAffiliateTools: detect(AFFILIATE_PATTERNS, successfulUrls),
      snapshots,
      limitations,
      renderedAt,
      viewport,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const browserMissing =
      /Executable doesn't exist|browser has not been downloaded|Failed to launch/i.test(message);
    return fail(message, [
      browserMissing
        ? "Chromium is not installed for Playwright. Run: npx playwright install chromium, then retry."
        : `Rendered capture failed: ${message}`,
    ]);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Closing is best effort.
      }
    }
  }
};
