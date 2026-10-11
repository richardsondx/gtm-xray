/**
 * channels.ts: detects which acquisition channels a company visibly invests
 * in, from the public surface of their site: content footprint (blog/docs/
 * changelog scale from the sitemap), social presence, community links,
 * integration directories, affiliate/partner programs, hiring signals, and
 * agent surfaces (llms.txt, /.well-known). Review-site presence (G2,
 * Capterra) cannot be fetched reliably from the outside, so it is recorded
 * as a limitation with a suggested manual check instead of guessed.
 */

import { fetchPage } from "./fetch.js";
import { extractPage, type ClassifiedLink } from "./extract.js";
import { fetchSitemap } from "./sitemap.js";
import {
  type Confidence,
  type Finding,
  pageEvidence,
  unverifiable,
} from "./evidence.js";

export interface ChannelSignal {
  readonly channel: string;
  readonly signal: string;
  readonly confidence: Confidence;
  readonly evidence: readonly ReturnType<typeof pageEvidence>[];
  readonly url: string;
}

interface Ctx {
  readonly origin: string;
  readonly homeLinks: readonly ClassifiedLink[];
  readonly homeHtml: string;
}

const socialPlatform = (href: string): string | null => {
  const host = (() => {
    try {
      return new URL(href).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const map: Readonly<Record<string, string>> = {
    "x.com": "X",
    "twitter.com": "X",
    "linkedin.com": "LinkedIn",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "tiktok.com": "TikTok",
    "reddit.com": "Reddit",
    "medium.com": "Medium",
  };
  for (const [domain, label] of Object.entries(map)) {
    if (host === domain || host.endsWith(`.${domain}`)) return label;
  }
  return null;
};

const contentChannel = async (
  ctx: Ctx,
): Promise<Finding<ChannelSignal>[]> => {
  const sitemap = await fetchSitemap(ctx.origin);
  const out: Finding<ChannelSignal>[] = [];
  const blog = sitemap.byPrefix["blog"] ?? 0;
  const docs = (sitemap.byPrefix["docs"] ?? 0) + (sitemap.byPrefix["documentation"] ?? 0);
  const changelog = sitemap.byPrefix["changelog"] ?? 0;
  const templates = sitemap.byPrefix["templates"] ?? 0;
  const customers = sitemap.byPrefix["customers"] ?? 0;

  const total = blog + docs + changelog + templates + customers;
  out.push({
    claim:
      sitemap.sourceUrl === null
        ? "No sitemap found; content scale could not be measured"
        : total > 0
          ? `Indexed content footprint: ~${sitemap.totalUrls} URLs (${blog} blog, ${docs} docs, ${templates} templates, ${customers} customer stories, ${changelog} changelog)`
          : `Sitemap found (${sitemap.totalUrls} URLs) but no /blog, /docs, /templates, /customers, or /changelog sections`,
    confidence: sitemap.sourceUrl === null ? "low" : "high",
    data: {
      channel: "SEO / content",
      signal:
        total > 200
          ? "heavy content investment"
          : total > 20
            ? "moderate content investment"
            : total > 0
              ? "light content presence"
              : "no measurable content footprint",
      confidence: sitemap.sourceUrl === null ? "low" : "high",
      evidence: sitemap.sourceUrl
        ? [pageEvidence(sitemap.sourceUrl, `${sitemap.totalUrls} URLs; blog=${blog}, docs=${docs}, templates=${templates}`, "sitemap")]
        : [],
      url: sitemap.sourceUrl ?? new URL("/sitemap.xml", ctx.origin).toString(),
    },
    evidence: sitemap.sourceUrl
      ? [pageEvidence(sitemap.sourceUrl, `${sitemap.totalUrls} URLs; blog=${blog}, docs=${docs}, templates=${templates}`, "sitemap")]
      : [],
    limitations: [...sitemap.limitations],
  });
  return out;
};

const socialChannel = (ctx: Ctx): Finding<ChannelSignal> | null => {
  const seen = new Map<string, string>();
  for (const link of ctx.homeLinks) {
    if (link.cls !== "social") continue;
    const platform = socialPlatform(link.href);
    if (platform && !seen.has(platform)) seen.set(platform, link.href);
  }
  if (seen.size === 0) return null;
  const names = [...seen.keys()].join(", ");
  return {
    claim: `Active social profiles linked from the site: ${names}`,
    confidence: "high",
    data: {
      channel: "Social (organic)",
      signal: `${seen.size} platform(s): ${names}`,
      confidence: "high",
      evidence: [...seen.entries()].map(([p, u]) =>
        pageEvidence(u, `${p} profile linked from site`),
      ),
      url: ctx.origin,
    },
    evidence: [...seen.entries()].map(([p, u]) =>
      pageEvidence(u, `${p} profile linked from site`),
    ),
    limitations: [
      "A linked profile does not prove it is active or drives signups; check posting cadence manually.",
    ],
  };
};

const communityChannel = (ctx: Ctx): Finding<ChannelSignal> | null => {
  const found: Array<{ label: string; url: string }> = [];
  for (const link of ctx.homeLinks) {
    const href = link.href.toLowerCase();
    const text = link.text.toLowerCase();
    if (href.includes("discord") || text.includes("discord"))
      found.push({ label: "Discord", url: link.href });
    else if (href.includes("slack.com") || text.includes("slack community"))
      found.push({ label: "Slack community", url: link.href });
    else if (href.includes("skool.com") || text.includes("skool"))
      found.push({ label: "Skool", url: link.href });
    else if (/community|forum/.test(text) && link.cls === "internal")
      found.push({ label: "Community/forum", url: link.href });
  }
  const unique = [...new Map(found.map((f) => [f.label, f])).values()];
  if (unique.length === 0) return null;
  return {
    claim: `Community surface found: ${unique.map((f) => f.label).join(", ")}`,
    confidence: "high",
    data: {
      channel: "Community",
      signal: unique.map((f) => f.label).join(", "),
      confidence: "high",
      evidence: unique.map((f) => pageEvidence(f.url, `${f.label} link on site`)),
      url: ctx.origin,
    },
    evidence: unique.map((f) => pageEvidence(f.url, `${f.label} link on site`)),
    limitations: [],
  };
};

const integrationsChannel = (ctx: Ctx): Finding<ChannelSignal> | null => {
  const found = new Map<string, string>();
  for (const link of ctx.homeLinks) {
    const href = link.href.toLowerCase();
    const text = link.text.toLowerCase();
    if (/\/integrations?(\/|$)/.test(href) || text.includes("integration"))
      found.set("Integrations directory", link.href);
    else if (/\/apps?(\/|$)/.test(href) && text.includes("app"))
      found.set("App marketplace", link.href);
    else if (/\/marketplace(\/|$)/.test(href))
      found.set("Marketplace listing", link.href);
    else if (/\/templates?(\/|$)/.test(href) && link.cls === "internal")
      found.set("Templates gallery", link.href);
  }
  if (found.size === 0) return null;
  return {
    claim: `Integration/marketplace surface: ${[...found.keys()].join(", ")}`,
    confidence: "high",
    data: {
      channel: "Integrations / marketplaces",
      signal: [...found.keys()].join(", "),
      confidence: "high",
      evidence: [...found.entries()].map(([k, u]) => pageEvidence(u, k)),
      url: ctx.origin,
    },
    evidence: [...found.entries()].map(([k, u]) => pageEvidence(u, k)),
    limitations: [],
  };
};

const PROGRAM_PATHS = ["/affiliates", "/affiliate", "/referral", "/referrals", "/partners", "/partnerships"];

const programChannel = async (ctx: Ctx): Promise<Finding<ChannelSignal> | null> => {
  for (const path of PROGRAM_PATHS) {
    const url = new URL(path, ctx.origin).toString();
    const res = await fetchPage(url);
    if (res.ok && res.html && res.html.length > 800) {
      const kind = /affiliate/i.test(path) ? "Affiliate program" : /referral/i.test(path) ? "Referral program" : "Partnerships program";
      const extract = extractPage(res.html, res.finalUrl);
      const label = extract.title ? extract.title.slice(0, 80) : `page at ${path}`;
      return {
        claim: `${kind} page exists at ${path}`,
        confidence: "high",
        data: {
          channel: "Affiliates / referrals",
          signal: `${kind}: ${label}`,
          confidence: "high",
          evidence: [pageEvidence(res.finalUrl, extract.title || `${kind} page`, "page")],
          url: res.finalUrl,
        },
        evidence: [pageEvidence(res.finalUrl, extract.title || `${kind} page`, "page")],
        limitations: [],
      };
    }
  }
  return null;
};

const hiringChannel = async (ctx: Ctx): Promise<Finding<ChannelSignal> | null> => {
  const jobsUrl = new URL("/careers", ctx.origin).toString();
  const jobsAlt = new URL("/jobs", ctx.origin).toString();
  const gtmRe = /\b(sales|account executive|ae\b|sdr|bdr|growth|marketing|demand gen|partnerships|developer relations|devrel)\b/i;
  for (const url of [jobsUrl, jobsAlt]) {
    const res = await fetchPage(url);
    if (!res.ok || !res.html) continue;
    const extract = extractPage(res.html, res.finalUrl);
    const headings = extract.headings.map((h) => h.text);
    const gtmRoles = headings.filter((h) => gtmRe.test(h));
    if (gtmRoles.length > 0) {
      return {
        claim: `Hiring for GTM roles: ${gtmRoles.slice(0, 5).join("; ")}`,
        confidence: "medium",
        data: {
          channel: "Outbound / sales hiring",
          signal: `${gtmRoles.length} GTM role(s) open: ${gtmRoles.slice(0, 5).join(", ")}`,
          confidence: "medium",
          evidence: [pageEvidence(res.finalUrl, gtmRoles.slice(0, 3).join(" | "), "page")],
          url: res.finalUrl,
        },
        evidence: [pageEvidence(res.finalUrl, gtmRoles.slice(0, 3).join(" | "), "page")],
        limitations: [
          "Open roles suggest investment direction, not a working outbound motion.",
        ],
      };
    }
    return {
      claim: "Jobs page exists but lists no GTM (sales/marketing/growth) roles",
      confidence: "medium",
      data: {
        channel: "Outbound / sales hiring",
        signal: "no GTM roles open",
        confidence: "medium",
        evidence: [pageEvidence(res.finalUrl, "careers page loaded", "page")],
        url: res.finalUrl,
      },
      evidence: [pageEvidence(res.finalUrl, "careers page loaded", "page")],
      limitations: [
        "Some companies hire GTM roles on external boards; absence here is weak evidence.",
      ],
    };
  }
  return null;
};

const agentSurfaceChannel = async (
  ctx: Ctx,
): Promise<Finding<ChannelSignal>[]> => {
  const out: Finding<ChannelSignal>[] = [];
  const checks: Array<{ path: string; label: string }> = [
    { path: "/llms.txt", label: "llms.txt" },
    { path: "/.well-known/", label: ".well-known directory" },
  ];
  for (const { path, label } of checks) {
    const url = new URL(path, ctx.origin).toString();
    const res = await fetchPage(url);
    if (res.ok && res.html && res.html.length > 50) {
      out.push({
        claim: `Agent surface present: ${label}`,
        confidence: "high",
        data: {
          channel: "Agent surfaces",
          signal: `${label} exists (${res.html.length} bytes)`,
          confidence: "high",
          evidence: [pageEvidence(url, res.html.slice(0, 160), "fetch")],
          url,
        },
        evidence: [pageEvidence(url, res.html.slice(0, 160), "fetch")],
        limitations: [],
      });
    }
  }
  return out;
};

export interface ChannelMap {
  readonly channels: readonly Finding<ChannelSignal>[];
  readonly limitations: readonly string[];
}

/** Map the visible acquisition channels for a domain. */
export const mapChannels = async (domain: string): Promise<ChannelMap> => {
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;
  const limitations: string[] = [];
  const home = await fetchPage(origin);
  if (!home.ok || !home.html) {
    return {
      channels: [],
      limitations: [
        `Homepage fetch failed (${home.status || home.error}); no channel signals could be collected.`,
      ],
    };
  }
  const extract = extractPage(home.html, home.finalUrl);
  const ctx: Ctx = {
    origin: new URL(home.finalUrl).origin,
    homeLinks: extract.allLinks,
    homeHtml: home.html,
  };
  if (extract.looksJsRendered) {
    limitations.push(
      "Homepage looks JS-rendered; nav/footer link signals may be incomplete.",
    );
  }

  const findings: Finding<ChannelSignal>[] = [];
  findings.push(...(await contentChannel(ctx)));
  const social = socialChannel(ctx);
  if (social) findings.push(social);
  const community = communityChannel(ctx);
  if (community) findings.push(community);
  const integrations = integrationsChannel(ctx);
  if (integrations) findings.push(integrations);
  const program = await programChannel(ctx);
  if (program) findings.push(program);
  const hiring = await hiringChannel(ctx);
  if (hiring) findings.push(hiring);
  findings.push(...(await agentSurfaceChannel(ctx)));

  limitations.push(
    unverifiable(
      "Review-site presence (G2, Capterra, Product Hunt ranking)",
      "search the company name on g2.com and capterra.com manually",
    ),
    unverifiable(
      "Paid acquisition (ads spend, keywords)",
      "check the Meta Ad Library and Google Ads Transparency Center for the brand",
    ),
  );

  return { channels: findings, limitations };
};
