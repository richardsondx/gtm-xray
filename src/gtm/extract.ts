/**
 * extract.ts: a small regex-based HTML extractor. No cheerio, no DOM.
 * It is deliberately lossy: it recovers structure (headings, links, meta)
 * from server-rendered HTML and records when the page looks JS-rendered so
 * callers can mark confidence low instead of hallucinating content.
 */

export type LinkClass =
  | "internal"
  | "blog"
  | "docs"
  | "pricing"
  | "changelog"
  | "social"
  | "github"
  | "external";

export interface ClassifiedLink {
  readonly href: string;
  readonly text: string;
  readonly cls: LinkClass;
}

export interface PageExtract {
  readonly title: string;
  readonly metaDescription: string;
  readonly h1s: readonly string[];
  /** First paragraph after the first h1, when present. */
  readonly firstParaAfterH1: string;
  readonly navLinks: readonly ClassifiedLink[];
  readonly footerLinks: readonly ClassifiedLink[];
  readonly allLinks: readonly ClassifiedLink[];
  readonly jsonLd: readonly string[];
  readonly wordCount: number;
  /** Stripped body text (truncated), for copy-level heuristics. */
  readonly bodyText: string;
  /** True when the body carries almost no text but loads app bundles: likely JS-rendered. */
  readonly looksJsRendered: boolean;
  readonly headings: readonly { level: number; text: string }[];
}

const stripTags = (s: string): string =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

const firstGroup = (re: RegExp, html: string): string | null => {
  const m = re.exec(html);
  return m?.[1]?.trim() ?? null;
};

const SOCIAL_DOMAINS: Readonly<Record<string, string>> = {
  "x.com": "x",
  "twitter.com": "x",
  "linkedin.com": "linkedin",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "tiktok.com": "tiktok",
  "reddit.com": "reddit",
  "discord.gg": "discord",
  "discord.com": "discord",
  "slack.com": "slack",
  "github.com": "github",
  "medium.com": "medium",
  "producthunt.com": "producthunt",
  "indiehackers.com": "indiehackers",
  "skool.com": "skool",
};

const PATH_CLASSES: ReadonlyArray<readonly [RegExp, LinkClass]> = [
  [/^\/(blog|articles|news|resources)(\/|$)/i, "blog"],
  [/^\/(docs|documentation|help|guides|developers)(\/|$)/i, "docs"],
  [/^\/(pricing|plans)(\/|$)/i, "pricing"],
  [/^\/(changelog|releases|updates)(\/|$)/i, "changelog"],
];

export const classifyLink = (
  rawHref: string,
  base: URL,
): { href: string; cls: LinkClass } | null => {
  const href = rawHref.trim();
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  )
    return null;
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  const absolute = url.toString();
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "github.com") return { href: absolute, cls: "github" };
  if (SOCIAL_DOMAINS[host] !== undefined) return { href: absolute, cls: "social" };
  const baseHost = base.hostname.toLowerCase().replace(/^www\./, "");
  const isInternal = host === baseHost || host.endsWith(`.${baseHost}`);
  if (!isInternal) return { href: absolute, cls: "external" };
  const path = url.pathname;
  for (const [re, cls] of PATH_CLASSES) {
    if (re.test(path)) return { href: absolute, cls: cls };
  }
  return { href: absolute, cls: "internal" };
};

const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const extractAnchors = (
  section: string,
  base: URL,
): ClassifiedLink[] => {
  const links: ClassifiedLink[] = [];
  const seen = new Set<string>();
  anchorRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(section)) !== null) {
    const classified = classifyLink(m[1] ?? "", base);
    if (!classified) continue;
    if (seen.has(classified.href)) continue;
    seen.add(classified.href);
    links.push({
      href: classified.href,
      text: stripTags(m[2] ?? "").slice(0, 80),
      cls: classified.cls,
    });
  }
  return links;
};

const sectionBetween = (html: string, tag: string): string => {
  const m = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "i").exec(html);
  return m?.[0] ?? "";
};

export const extractPage = (html: string, pageUrl: string): PageExtract => {
  const base = new URL(pageUrl);
  const head = sectionBetween(html, "head");
  const title = firstGroup(/<title[^>]*>([\s\S]*?)<\/title>/i, head) ?? "";
  const metaDescription =
    firstGroup(
      /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
      head,
    ) ??
    firstGroup(
      /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i,
      head,
    ) ??
    "";

  const headings: { level: number; text: string }[] = [];
  const hRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hRe.exec(html)) !== null) {
    const text = stripTags(hm[2] ?? "");
    if (text) headings.push({ level: Number(hm[1]), text });
  }
  const h1s = headings.filter((h) => h.level === 1).map((h) => h.text);

  // First paragraph after the first h1 tag in source order.
  let firstParaAfterH1 = "";
  const firstH1Tag = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(html);
  if (firstH1Tag && firstH1Tag.index !== undefined) {
    const after = html.slice(firstH1Tag.index + firstH1Tag[0].length);
    const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after);
    if (p?.[1]) firstParaAfterH1 = stripTags(p[1]).slice(0, 400);
  }

  const navHtml =
    sectionBetween(html, "nav") ||
    firstGroup(/(<header\b[\s\S]*?<\/header>)/i, html) ||
    "";
  const footerHtml = sectionBetween(html, "footer") || "";

  const navLinks = extractAnchors(navHtml, base);
  const footerLinks = extractAnchors(footerHtml, base);
  const allLinks = extractAnchors(html, base);

  const jsonLd: string[] = [];
  const ldRe =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldm: RegExpExecArray | null;
  while ((ldm = ldRe.exec(html)) !== null) {
    const raw = (ldm[1] ?? "").trim();
    if (raw) jsonLd.push(raw.slice(0, 2000));
  }

  const bodyText = stripTags(
    sectionBetween(html, "body") || html,
  );
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const scriptSrcs = (
    html.match(/<script\b[^>]*src=["'][^"']+["']/gi) ?? []
  ).length;
  const looksJsRendered =
    wordCount < 120 && (scriptSrcs > 0 || /id=["'](__next|root|app)["']/i.test(html));

  return {
    title: stripTags(title),
    metaDescription: metaDescription.trim(),
    h1s,
    firstParaAfterH1,
    navLinks,
    footerLinks,
    allLinks,
    jsonLd,
    wordCount,
    bodyText: bodyText.slice(0, 20000),
    looksJsRendered,
    headings,
  };
};
