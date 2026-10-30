/**
 * loops.ts: detects product-led acquisition loops: free tools, template
 * galleries, public share artifacts (shared links that market the product),
 * referral program terms, open-source repos used as distribution, and
 * API/developer docs as a channel.
 */

import { fetchPage } from "./fetch.js";
import { extractPage } from "./extract.js";
import { fetchSitemap } from "./sitemap.js";
import {
  type Confidence,
  type Finding,
  pageEvidence,
} from "./evidence.js";

export interface AcquisitionLoop {
  readonly loop: string;
  readonly description: string;
  readonly confidence: Confidence;
}

const FREE_TOOL_PATHS = [
  "/tools",
  "/free-tools",
  "/generators",
  "/calculators",
  "/free",
];

const findFreeTools = async (
  origin: string,
): Promise<Finding<AcquisitionLoop> | null> => {
  for (const path of FREE_TOOL_PATHS) {
    const url = new URL(path, origin).toString();
    const res = await fetchPage(url);
    if (res.ok && res.html && res.html.length > 800) {
      const extract = extractPage(res.html, res.finalUrl);
      const count = extract.allLinks.filter(
        (l) => l.cls === "internal" && l.href.startsWith(new URL(path, origin).toString()),
      ).length;
      return {
        claim: `Free tools section at ${path}`,
        confidence: "high",
        data: {
          loop: "Free tools",
          description: `Free tooling hub at ${path} (${extract.title.slice(0, 80)})`,
          confidence: "high",
        },
        evidence: [pageEvidence(res.finalUrl, extract.title || `free tools at ${path}`)],
        limitations: [
          "Tool count is approximate; each tool is a separate SEO landing page only if indexed.",
        ],
      };
    }
  }
  return null;
};

const findTemplates = (
  origin: string,
  sitemapPrefixes: Readonly<Record<string, number>>,
  links: readonly { href: string; text: string }[],
): Finding<AcquisitionLoop> | null => {
  const count = sitemapPrefixes["templates"] ?? 0;
  const linked = links.some((l) => /\/templates?(\/|$)/i.test(l.href));
  if (count === 0 && !linked) return null;
  return {
    claim:
      count > 0
        ? `Templates gallery with ~${count} indexed template pages`
        : "Templates gallery linked from the site",
    confidence: "high",
    data: {
      loop: "Templates gallery",
      description:
        count > 0
          ? `${count} template pages in sitemap; each is a long-tail SEO entry point that onboards into the product`
          : "Templates gallery linked from the site; each template is a long-tail entry point",
      confidence: "high",
    },
    evidence: [
      pageEvidence(
        new URL("/templates", origin).toString(),
        count > 0 ? `${count} /templates/* URLs in sitemap` : "templates link on site",
        "sitemap",
      ),
    ],
    limitations: [],
  };
};

const findShareArtifacts = (homeHtml: string): Finding<AcquisitionLoop> | null => {
  const re = /\b(public (link|page|profile|booking page|form)|share (link|your|this)|embeddable|embed (code|widget))\b/i;
  const m = re.exec(homeHtml.replace(/<[^>]*>/g, " "));
  if (!m) return null;
  return {
    claim: `Public share artifacts: copy mentions "${m[0].trim().slice(0, 60)}"`,
    confidence: "medium",
    data: {
      loop: "Public share artifacts",
      description:
        "Users publish public pages/links made with the product; every artifact carries the brand to non-users",
      confidence: "medium",
    },
    evidence: [pageEvidence("", `copy: "...${m[0].trim().slice(0, 80)}..."`)],
    limitations: [
      "Copy mention does not prove users actually share; check for live public examples.",
    ],
  };
};

const findReferralTerms = async (
  origin: string,
): Promise<Finding<AcquisitionLoop> | null> => {
  for (const path of ["/referral", "/referrals", "/affiliate", "/affiliates"]) {
    const url = new URL(path, origin).toString();
    const res = await fetchPage(url);
    if (res.ok && res.html && res.html.length > 800) {
      // Old bug, fixed Oct 30: terms were pulled from raw HTML, so the
      // first "%" in a stylesheet or script (Higgsfield: "0%") became
      // "Program pays/shares 0% per referral", which is nonsense. Now
      // strip scripts/styles first, and only accept a rate that sits
      // next to earn/commission/up-to wording. A bare 0% is ignored.
      const text = res.html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ");
      const termsMatch =
        /(earn|commission|up to|get|receive)[^.;]{0,40}?([\d]+%|\$[\d,]+|free (month|year|credits?))/i.exec(
          text,
        );
      const terms =
        termsMatch?.[2] && termsMatch[2] !== "0%" ? termsMatch[2] : null;
      return {
        claim: `Referral/affiliate program at ${path}${terms ? ` (terms mention "${terms}")` : ""}`,
        confidence: "high",
        data: {
          loop: "Referral / affiliate",
          description: terms
            ? `Program pays/shares "${terms}" per referral`
            : "Referral or affiliate program exists; terms not extracted",
          confidence: "high",
        },
        evidence: [pageEvidence(res.finalUrl, terms ? `terms mention "${terms}"` : "program page exists")],
        limitations: [],
      };
    }
  }
  return null;
};

const findOpenSource = (
  links: readonly { href: string; text: string }[],
): Finding<AcquisitionLoop> | null => {
  const gh = links.find((l) => /github\.com\//i.test(l.href));
  if (!gh) return null;
  return {
    claim: `GitHub presence linked: ${gh.href.slice(0, 80)}`,
    confidence: "medium",
    data: {
      loop: "Open source as distribution",
      description:
        "Public GitHub repo linked from the marketing site; open source can drive developer adoption and trust",
      confidence: "medium",
    },
    evidence: [pageEvidence(gh.href, "GitHub link on site")],
    limitations: [
      "Link alone does not show stars, contributors, or whether the core product is open source; check the repo.",
    ],
  };
};

const findApiDocs = (
  links: readonly { href: string; text: string }[],
  sitemapPrefixes: Readonly<Record<string, number>>,
): Finding<AcquisitionLoop> | null => {
  const linked = links.some((l) => /\/api\b|\/developers?\b|\/docs\/api/i.test(l.href));
  const docsCount = (sitemapPrefixes["docs"] ?? 0) + (sitemapPrefixes["documentation"] ?? 0);
  if (!linked && docsCount === 0) return null;
  return {
    claim: linked
      ? "API / developer docs linked from the site"
      : `${docsCount} docs pages in sitemap (possible API surface)`,
    confidence: linked ? "high" : "low",
    data: {
      loop: "API / developer docs",
      description:
        "Developer docs turn integrators into a distribution channel: every integration brings its users",
      confidence: linked ? "high" : "low",
    },
    evidence: [
      pageEvidence(
        "",
        linked ? "API/developer docs link on site" : `${docsCount} docs URLs in sitemap`,
      ),
    ],
    limitations: [],
  };
};

export interface LoopMap {
  readonly loops: readonly Finding<AcquisitionLoop>[];
  readonly limitations: readonly string[];
}

/** Find product-led acquisition loops for a domain. */
export const findAcquisitionLoops = async (domain: string): Promise<LoopMap> => {
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;
  const limitations: string[] = [];
  const loops: Finding<AcquisitionLoop>[] = [];

  const home = await fetchPage(origin);
  if (!home.ok || !home.html) {
    return {
      loops: [],
      limitations: [
        `Homepage fetch failed (${home.status || home.error}); loop detection skipped.`,
      ],
    };
  }
  const homeExtract = extractPage(home.html, home.finalUrl);
  const originFinal = new URL(home.finalUrl).origin;

  const sitemap = await fetchSitemap(originFinal);
  limitations.push(...sitemap.limitations);

  const freeTools = await findFreeTools(originFinal);
  if (freeTools) loops.push(freeTools);

  const templates = findTemplates(originFinal, sitemap.byPrefix, homeExtract.allLinks);
  if (templates) loops.push(templates);

  const share = findShareArtifacts(home.html);
  if (share) loops.push(share);

  const referral = await findReferralTerms(originFinal);
  if (referral) loops.push(referral);

  const oss = findOpenSource(homeExtract.allLinks);
  if (oss) loops.push(oss);

  const api = findApiDocs(homeExtract.allLinks, sitemap.byPrefix);
  if (api) loops.push(api);

  if (loops.length === 0) {
    limitations.push(
      "No product-led acquisition loops detected on the public surface.",
    );
  }

  return { loops, limitations };
};
