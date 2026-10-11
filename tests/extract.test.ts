import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPage, classifyLink } from "../src/gtm/extract.js";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("extractPage", () => {
  const page = extractPage(fixture("acme-home.html"), "https://acme.test/");

  it("reads title and meta description", () => {
    expect(page.title).toContain("Acme Scheduler");
    expect(page.metaDescription).toContain("Free 14-day trial");
  });

  it("reads the h1 and the paragraph after it", () => {
    expect(page.h1s).toEqual(["Book meetings in one click"]);
    expect(page.firstParaAfterH1).toContain("busy teams");
  });

  it("classifies nav and footer links", () => {
    const byHref = new Map(page.allLinks.map((l) => [l.href, l.cls]));
    expect(byHref.get("https://acme.test/pricing")).toBe("pricing");
    expect(byHref.get("https://acme.test/blog")).toBe("blog");
    expect(byHref.get("https://acme.test/docs")).toBe("docs");
    expect(byHref.get("https://acme.test/changelog")).toBe("changelog");
    expect(byHref.get("https://x.com/acmesched")).toBe("social");
    expect(byHref.get("https://github.com/acmesched/app")).toBe("github");
    expect(byHref.get("https://discord.gg/acme")).toBe("social");
  });

  it("reads JSON-LD blocks", () => {
    expect(page.jsonLd.length).toBe(1);
    expect(page.jsonLd[0]).toContain("SoftwareApplication");
  });

  it("counts words and does not flag a text-rich page as JS-rendered", () => {
    expect(page.wordCount).toBeGreaterThan(20);
    expect(page.looksJsRendered).toBe(false);
  });

  it("flags an app-shell page as JS-rendered", () => {
    const shell = extractPage(
      `<html><head></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
      "https://acme.test/",
    );
    expect(shell.looksJsRendered).toBe(true);
  });
});

describe("classifyLink", () => {
  const base = new URL("https://acme.test/");

  it("returns null for anchors, mailto, and javascript links", () => {
    expect(classifyLink("#top", base)).toBeNull();
    expect(classifyLink("mailto:a@b.test", base)).toBeNull();
    expect(classifyLink("javascript:void(0)", base)).toBeNull();
  });

  it("treats subdomains of the base host as internal", () => {
    const r = classifyLink("https://docs.acme.test/guide", base);
    expect(r?.cls).toBe("internal");
  });
});
