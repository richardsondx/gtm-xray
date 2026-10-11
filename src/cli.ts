/**
 * cli.ts: the `gtmx` command line interface. Hand-rolled arg parsing (no
 * runtime deps). Every command supports --json and --out <file>.
 */

import { mkdir, readFile, rename, writeFile, cp, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { runTeardown, type TeardownDepth } from "./gtm/teardown.js";
import { positioningForUrl } from "./gtm/positioning.js";
import { pricingForUrl, findPricingUrl } from "./gtm/pricing.js";
import { mapChannels } from "./gtm/channels.js";
import { findAcquisitionLoops } from "./gtm/loops.js";
import {
  buildDistributionPlan,
  type Motion,
  type TeardownSummary,
} from "./gtm/distributionPlan.js";
import {
  renderTeardownMarkdown,
  renderPlanMarkdown,
  renderJson,
} from "./gtm/report.js";
import { nowIso } from "./gtm/evidence.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Package root: dist/.. when compiled, src/.. when run via tsx-like tooling. */
export const packageRoot = resolve(here, "..");

interface GlobalOpts {
  json: boolean;
  out: string | null;
}

const usage = `gtm-xray: reverse-engineer any startup's go-to-market strategy.

Usage:
  gtmx teardown <company> <domain> [--depth full] [--json] [--out file]
  gtmx positioning <url> [--json] [--out file]
  gtmx pricing <domain-or-url> [--json] [--out file]
  gtmx channels <domain> [--json] [--out file]
  gtmx loops <domain> [--json] [--out file]
  gtmx plan --startup "..." --icp "..." [--price 29] [--motion plg|sales|hybrid]
       [--teardown '<json>' ...] [--teardown-file teardowns.json] [--json] [--out file]
  gtmx setup [--global]
  gtmx mcp

Every finding carries evidence, a confidence level, and limitations.
Markdown reports end with a "What we could not verify" section.
`;

const parseGlobals = (args: string[]): { opts: GlobalOpts; rest: string[] } => {
  const opts: GlobalOpts = { json: false, out: null };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--json") opts.json = true;
    else if (a === "--out") {
      const next = args[i + 1];
      if (!next) throw new Error("--out needs a file path");
      opts.out = next;
      i += 1;
    } else rest.push(a);
  }
  return { opts, rest };
};

const emit = async (
  opts: GlobalOpts,
  markdown: string,
  json: string,
): Promise<void> => {
  const text = opts.json ? json : markdown;
  if (opts.out) {
    await mkdir(dirname(resolve(opts.out)), { recursive: true });
    await writeFile(resolve(opts.out), text, "utf8");
    console.log(`Wrote ${resolve(opts.out)}`);
  } else {
    console.log(text);
  }
};

const cmdTeardown = async (args: string[]): Promise<void> => {
  const { opts, rest } = parseGlobals(args);
  const [company, domain, ...flagArgs] = rest;
  if (!company || !domain) throw new Error("Usage: gtmx teardown <company> <domain> [--depth full]");
  const depthIdx = flagArgs.indexOf("--depth");
  const depth: TeardownDepth =
    depthIdx >= 0 && flagArgs[depthIdx + 1] === "full" ? "full" : "quick";
  const result = await runTeardown(company, domain, depth);
  await emit(opts, renderTeardownMarkdown(result), renderJson(result));
};

const cmdPositioning = async (args: string[]): Promise<void> => {
  const { opts, rest } = parseGlobals(args);
  const [url] = rest;
  if (!url) throw new Error("Usage: gtmx positioning <url>");
  const finding = await positioningForUrl(url);
  const envelope = { findings: finding, limitations: finding.limitations, generated_at: nowIso() };
  const md = [
    `# Positioning: ${url}`,
    "",
    `- Claim: ${finding.claim} [${finding.confidence.toUpperCase()}]`,
    `- Headline: ${finding.data.headline || "(none)"}`,
    `- Subhead: ${finding.data.subhead || "(none)"}`,
    `- Category: ${finding.data.categoryClaim ?? "(none)"}`,
    `- Audience: ${finding.data.audienceSignals.join(", ") || "(none)"}`,
    `- Social proof: ${finding.data.socialProof.join(", ") || "(none)"}`,
    "",
    "## What we could not verify",
    ...finding.limitations.map((l) => `- ${l}`),
    "",
  ].join("\n");
  await emit(opts, md, renderJson(envelope));
};

const cmdPricing = async (args: string[]): Promise<void> => {
  const { opts, rest } = parseGlobals(args);
  const [target] = rest;
  if (!target) throw new Error("Usage: gtmx pricing <domain-or-url>");
  let url = target;
  if (!/^https?:\/\//i.test(url)) {
    const found = await findPricingUrl(target);
    if (!found.url) throw new Error(found.limitation ?? "No pricing page found");
    url = found.url;
  }
  const finding = await pricingForUrl(url);
  const envelope = { findings: finding, limitations: finding.limitations, generated_at: nowIso() };
  const md = [
    `# Pricing: ${url}`,
    "",
    `- Claim: ${finding.claim} [${finding.confidence.toUpperCase()}]`,
    `- Billing model: ${finding.data.billingModel}`,
    `- Free trial: ${finding.data.hasFreeTrial ? "yes" : "no"}; freemium: ${finding.data.hasFreemium ? "yes" : "no"}`,
    ...finding.data.plans.map(
      (p) =>
        `- ${p.planName}: ${p.monthly !== null ? `${p.currency}${p.monthly}/mo` : "n/a"}${p.annualMonthly !== null ? ` (${p.currency}${p.annualMonthly}/mo annual)` : ""}`,
    ),
    "",
    "## What we could not verify",
    ...finding.limitations.map((l) => `- ${l}`),
    "",
  ].join("\n");
  await emit(opts, md, renderJson(envelope));
};

const cmdChannels = async (args: string[]): Promise<void> => {
  const { opts, rest } = parseGlobals(args);
  const [domain] = rest;
  if (!domain) throw new Error("Usage: gtmx channels <domain>");
  const map = await mapChannels(domain);
  const envelope = { findings: map.channels, limitations: map.limitations, generated_at: nowIso() };
  const md = [
    `# Channels: ${domain}`,
    "",
    "| Channel | Signal | Confidence | Evidence |",
    "| --- | --- | --- | --- |",
    ...map.channels.map((c) =>
      `| ${c.data.channel} | ${c.data.signal} | ${c.confidence.toUpperCase()} | ${c.evidence.map((e) => e.url || "(site)").join("<br>") || "none"} |`,
    ),
    "",
    "## What we could not verify",
    ...map.limitations.map((l) => `- ${l}`),
    "",
  ].join("\n");
  await emit(opts, md, renderJson(envelope));
};

const cmdLoops = async (args: string[]): Promise<void> => {
  const { opts, rest } = parseGlobals(args);
  const [domain] = rest;
  if (!domain) throw new Error("Usage: gtmx loops <domain>");
  const map = await findAcquisitionLoops(domain);
  const envelope = { findings: map.loops, limitations: map.limitations, generated_at: nowIso() };
  const md = [
    `# Acquisition loops: ${domain}`,
    "",
    ...map.loops.flatMap((l) => [
      `## ${l.data.loop} [${l.confidence.toUpperCase()}]`,
      "",
      l.data.description,
      ...l.evidence.map((e) => `- [${e.type}] ${e.url || "(site)"}: "${e.snippet}"`),
      "",
    ]),
    "## What we could not verify",
    ...map.limitations.map((l) => `- ${l}`),
    "",
  ].join("\n");
  await emit(opts, md, renderJson(envelope));
};

interface PlanFlags {
  startup: string | null;
  icp: string | null;
  price: number | null;
  motion: Motion;
  teardowns: string[];
  teardownFile: string | null;
  json: boolean;
  out: string | null;
}

const parsePlanFlags = (args: string[]): PlanFlags => {
  const flags: PlanFlags = {
    startup: null,
    icp: null,
    price: null,
    motion: "unknown",
    teardowns: [],
    teardownFile: null,
    json: false,
    out: null,
  };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = (): string => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === "--startup") flags.startup = next();
    else if (a === "--icp") flags.icp = next();
    else if (a === "--price") flags.price = Number(next());
    else if (a === "--motion") {
      const m = next();
      if (!["plg", "sales", "hybrid", "unknown"].includes(m))
        throw new Error("--motion must be plg, sales, hybrid, or unknown");
      flags.motion = m as Motion;
    } else if (a === "--teardown") flags.teardowns.push(next());
    else if (a === "--teardown-file") flags.teardownFile = next();
    else if (a === "--json") flags.json = true;
    else if (a === "--out") flags.out = next();
    else throw new Error(`Unknown flag: ${a}`);
  }
  return flags;
};

const cmdPlan = async (args: string[]): Promise<void> => {
  const flags = parsePlanFlags(args);
  if (!flags.startup || !flags.icp)
    throw new Error("Usage: gtmx plan --startup ... --icp ... [--price N] [--motion M] [--teardown '<json>' ...]");
  const summaries: TeardownSummary[] = [];
  for (const raw of flags.teardowns) {
    const parsed = JSON.parse(raw) as {
      company: string;
      channels: string[];
      loops: string[];
      price_point?: number | null;
    };
    summaries.push({
      company: parsed.company,
      channels: parsed.channels ?? [],
      loops: parsed.loops ?? [],
      pricePoint: parsed.price_point ?? null,
    });
  }
  if (flags.teardownFile) {
    const raw = await readFile(resolve(flags.teardownFile), "utf8");
    const parsed = JSON.parse(raw) as Array<{
      company: string;
      channels: string[];
      loops: string[];
      price_point?: number | null;
    }>;
    for (const p of parsed) {
      summaries.push({
        company: p.company,
        channels: p.channels ?? [],
        loops: p.loops ?? [],
        pricePoint: p.price_point ?? null,
      });
    }
  }
  const plan = buildDistributionPlan({
    startup: flags.startup,
    icp: flags.icp,
    pricePoint: flags.price,
    motion: flags.motion,
    teardownSummaries: summaries,
  });
  const envelope = { findings: plan, limitations: plan.limitations, generated_at: nowIso() };
  await emit(
    { json: flags.json, out: flags.out },
    renderPlanMarkdown(envelope),
    renderJson(envelope),
  );
};

/* ---------------- setup ---------------- */

const skillSourceDir = (): string =>
  join(packageRoot, ".agents", "skills", "reverse-engineer-gtm");

const exists = async (p: string): Promise<boolean> => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

const backupPath = async (p: string): Promise<string> => {
  let candidate = `${p}.bak`;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${p}.bak.${n}`;
  }
  return candidate;
};

const readJsonFile = async (p: string): Promise<Record<string, unknown>> => {
  try {
    return JSON.parse(await readFile(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const writeJsonFile = async (p: string, data: Record<string, unknown>): Promise<void> => {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + "\n", "utf8");
};

interface SetupChange {
  readonly target: string;
  readonly action: string;
}

const registerMcpJson = async (
  configPath: string,
  label: string,
  changes: SetupChange[],
): Promise<void> => {
  const config = await readJsonFile(configPath);
  const servers = (config["mcpServers"] as Record<string, unknown> | undefined) ?? {};
  const key = "gtm-xray";
  const entry = { command: "npx", args: ["-y", "gtm-xray", "mcp"] };
  const prev = servers[key];
  if (JSON.stringify(prev) === JSON.stringify(entry)) {
    changes.push({ target: label, action: "already registered, left as-is" });
    return;
  }
  if (prev !== undefined) {
    const bak = await backupPath(configPath);
    await writeFile(bak, JSON.stringify(config, null, 2) + "\n", "utf8");
    changes.push({ target: label, action: `existing entry backed up to ${bak}` });
  }
  servers[key] = entry;
  config["mcpServers"] = servers;
  await writeJsonFile(configPath, config);
  changes.push({ target: label, action: `registered gtm-xray (npx -y gtm-xray mcp)` });
};

const registerMcpToml = async (
  configPath: string,
  changes: SetupChange[],
): Promise<void> => {
  let text = "";
  try {
    text = await readFile(configPath, "utf8");
  } catch {
    text = "";
  }
  const header = "[mcp_servers.gtm-xray]";
  if (text.includes(header)) {
    changes.push({ target: "Codex (~/.codex/config.toml)", action: "already registered, left as-is" });
    return;
  }
  if (text) {
    const bak = await backupPath(configPath);
    await writeFile(bak, text, "utf8");
    changes.push({ target: "Codex (~/.codex/config.toml)", action: `existing config backed up to ${bak}` });
  }
  const block = `${header}\ncommand = "npx"\nargs = ["-y", "gtm-xray", "mcp"]\n`;
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, (text.endsWith("\n") || text === "" ? text : text + "\n") + "\n" + block, "utf8");
  changes.push({ target: "Codex (~/.codex/config.toml)", action: "registered gtm-xray (npx -y gtm-xray mcp)" });
};

const cmdSetup = async (args: string[]): Promise<void> => {
  const global = args.includes("--global");
  const changes: SetupChange[] = [];
  const home = homedir();

  await registerMcpJson(join(home, ".claude.json"), "Claude Code (~/.claude.json)", changes);
  await registerMcpJson(join(home, ".cursor", "mcp.json"), "Cursor (~/.cursor/mcp.json)", changes);
  await registerMcpToml(join(home, ".codex", "config.toml"), changes);

  const src = skillSourceDir();
  if (!(await exists(join(src, "SKILL.md")))) {
    throw new Error(`Skill source not found at ${src}; is the package installed correctly?`);
  }
  const dest = global
    ? join(home, ".agents", "skills", "reverse-engineer-gtm")
    : resolve(process.cwd(), ".agents", "skills", "reverse-engineer-gtm");
  if (resolve(src) === resolve(dest)) {
    changes.push({ target: dest, action: "already in place (setup run from the gtm-xray repo), skipped" });
  } else {
    const sameSkill =
      (await exists(join(dest, "SKILL.md"))) &&
      (await readFile(join(src, "SKILL.md"), "utf8")) ===
        (await readFile(join(dest, "SKILL.md"), "utf8").catch(() => ""));
    if (sameSkill) {
      changes.push({ target: dest, action: "already installed, left as-is" });
    } else {
      if (await exists(dest)) {
        const bak = await backupPath(dest);
        await rename(dest, bak);
        changes.push({ target: dest, action: `existing skill backed up to ${bak}` });
      }
      await mkdir(dirname(dest), { recursive: true });
      await cp(src, dest, { recursive: true });
      changes.push({ target: dest, action: "skill installed (reverse-engineer-gtm)" });
    }
  }

  console.log("gtm-xray setup complete. Changes:");
  for (const c of changes) console.log(`- ${c.target}: ${c.action}`);
  console.log("\nRestart your agent client so it picks up the new MCP server.");
};

/* ---------------- main dispatch ---------------- */

export const runCli = async (argv: string[]): Promise<void> => {
  const [cmd, ...args] = argv;
  switch (cmd) {
    case "teardown":
      await cmdTeardown(args);
      break;
    case "positioning":
      await cmdPositioning(args);
      break;
    case "pricing":
      await cmdPricing(args);
      break;
    case "channels":
      await cmdChannels(args);
      break;
    case "loops":
      await cmdLoops(args);
      break;
    case "plan":
      await cmdPlan(args);
      break;
    case "setup":
      await cmdSetup(args);
      break;
    case "mcp":
      throw new Error("use `gtmx` with no subcommand (or node dist/main.js) to start the MCP server");
    case "--help":
    case "-h":
    case "help":
      console.log(usage);
      break;
    default:
      throw new Error(`Unknown command: ${cmd ?? "(none)"}\n\n${usage}`);
  }
};
