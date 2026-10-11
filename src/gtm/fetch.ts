/**
 * Fetcher: one small wrapper around global fetch with a 15s timeout, a real
 * browser user-agent, and manual redirect following so we can record the
 * final URL. Never throws on HTTP errors: failures are returned as data so
 * callers can record them as evidence limitations.
 */

export interface FetchResult {
  /** The URL as requested. */
  readonly url: string;
  /** The final URL after redirects (same as url when no redirect). */
  readonly finalUrl: string;
  /** HTTP status code, or 0 when the request itself failed. */
  readonly status: number;
  /** True when 2xx and a body was read. */
  readonly ok: boolean;
  /** Response body text (empty string when not ok or not text). */
  readonly html: string;
  /** Content-Type header, lowercased. */
  readonly contentType: string;
  /** When status === 0: why the request failed (dns, timeout, tls, ...). */
  readonly error: string | null;
  /** Redirect chain, in order, including the final URL. */
  readonly redirectChain: readonly string[];
}

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const failed = (url: string, error: string): FetchResult => ({
  url,
  finalUrl: url,
  status: 0,
  ok: false,
  html: "",
  contentType: "",
  error,
  redirectChain: [url],
});

const isText = (contentType: string): boolean =>
  contentType === "" ||
  contentType.includes("text/") ||
  contentType.includes("json") ||
  contentType.includes("xml") ||
  contentType.includes("svg");

/**
 * Fetch a URL. Follows up to 5 redirects manually. Resolves (never rejects)
 * with a FetchResult describing success or failure.
 */
export const fetchPage = async (
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchResult> => {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const chain: string[] = [];
  let current = url;
  let redirects = 0;

  while (redirects <= MAX_REDIRECTS) {
    chain.push(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const reason =
        err instanceof Error
          ? err.name === "AbortError"
            ? `timeout after ${timeoutMs}ms`
            : err.message
          : String(err);
      return { ...failed(url, reason), redirectChain: chain };
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          url,
          finalUrl: current,
          status: response.status,
          ok: false,
          html: "",
          contentType: response.headers.get("content-type") ?? "",
          error: "redirect without Location header",
          redirectChain: chain,
        };
      }
      try {
        current = new URL(location, current).toString();
      } catch {
        return {
          url,
          finalUrl: current,
          status: response.status,
          ok: false,
          html: "",
          contentType: response.headers.get("content-type") ?? "",
          error: `unparseable redirect Location: ${location}`,
          redirectChain: chain,
        };
      }
      redirects += 1;
      continue;
    }

    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();
    let html = "";
    if (response.ok && isText(contentType)) {
      try {
        html = await response.text();
      } catch (err) {
        return {
          url,
          finalUrl: current,
          status: response.status,
          ok: false,
          html: "",
          contentType,
          error: `body read failed: ${err instanceof Error ? err.message : String(err)}`,
          redirectChain: chain,
        };
      }
    }
    return {
      url,
      finalUrl: current,
      status: response.status,
      ok: response.ok,
      html,
      contentType,
      error: response.ok ? null : `HTTP ${response.status}`,
      redirectChain: chain,
    };
  }

  return { ...failed(url, "too many redirects"), redirectChain: chain };
};
