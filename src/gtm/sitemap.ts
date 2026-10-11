/**
 * sitemap.ts: estimates a site's content footprint from its sitemap files.
 * Fetches /sitemap.xml and common variants, parses <loc> entries (and nested
 * sitemap indexes), then buckets URLs by path prefix: /blog/*, /docs/*,
 * /templates/*, /customers/*, /changelog/*.
 */

import { fetchPage } from "./fetch.js";

export interface SitemapBucket {
  readonly bucket: string;
  readonly count: number;
}

export interface SitemapResult {
  /** The sitemap URL that responded (null when none found). */
  readonly sourceUrl: string | null;
  readonly totalUrls: number;
  readonly buckets: readonly SitemapBucket[];
  /** Raw bucket counts keyed by path prefix. */
  readonly byPrefix: Readonly<Record<string, number>>;
  readonly limitations: readonly string[];
}

const SITEMAP_CANDIDATES = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap/sitemap.xml",
  "/sitemaps/sitemap.xml",
];

const BUCKET_PREFIXES = [
  "blog",
  "docs",
  "documentation",
  "templates",
  "customers",
  "changelog",
  "resources",
  "guides",
  "help",
  "learn",
  "use-cases",
  "integrations",
  "pricing",
  "features",
];

const locRe = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

const parseLocs = (xml: string): string[] => {
  const urls: string[] = [];
  locRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = locRe.exec(xml)) !== null) {
    if (m[1]) urls.push(m[1].trim());
  }
  return urls;
};

const isSitemapIndex = (xml: string): boolean =>
  /<sitemapindex[\s>]/i.test(xml);

export const fetchSitemap = async (domain: string): Promise<SitemapResult> => {
  const origin = domain.startsWith("http") ? domain : `https://${domain}`;
  const limitations: string[] = [];
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return {
      sourceUrl: null,
      totalUrls: 0,
      buckets: [],
      byPrefix: {},
      limitations: [`Could not parse domain as URL: ${domain}`],
    };
  }

  const allUrls: string[] = [];
  let sourceUrl: string | null = null;

  for (const candidate of SITEMAP_CANDIDATES) {
    const candidateUrl = new URL(candidate, originUrl).toString();
    const res = await fetchPage(candidateUrl);
    if (!res.ok || !res.html) {
      limitations.push(`${candidate} -> HTTP ${res.status || res.error}`);
      continue;
    }
    sourceUrl = candidateUrl;
    const locs = parseLocs(res.html);
    if (isSitemapIndex(res.html)) {
      // Nested sitemaps: fetch each (cap at 20 to stay fast).
      const nested = locs.slice(0, 20);
      if (locs.length > 20)
        limitations.push(
          `Sitemap index lists ${locs.length} nested sitemaps; only the first 20 were read.`,
        );
      for (const nestedUrl of nested) {
        const nestedRes = await fetchPage(nestedUrl);
        if (nestedRes.ok && nestedRes.html)
          allUrls.push(...parseLocs(nestedRes.html));
      }
    } else {
      allUrls.push(...locs);
    }
    break; // first working sitemap wins
  }

  if (sourceUrl === null) {
    limitations.push(
      "No sitemap found at common locations; content-footprint estimates are unavailable.",
    );
    return { sourceUrl, totalUrls: 0, buckets: [], byPrefix: {}, limitations };
  }

  const byPrefix: Record<string, number> = {};
  for (const url of allUrls) {
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch {
      continue;
    }
    const first = path.split("/").filter(Boolean)[0] ?? "";
    const bucket = BUCKET_PREFIXES.includes(first) ? first : "other";
    byPrefix[bucket] = (byPrefix[bucket] ?? 0) + 1;
  }

  const buckets: SitemapBucket[] = Object.entries(byPrefix)
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => b.count - a.count);

  return { sourceUrl, totalUrls: allUrls.length, buckets, byPrefix, limitations };
};
