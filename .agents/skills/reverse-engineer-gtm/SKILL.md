---
name: reverse-engineer-gtm
description: Reverse-engineer any startup's go-to-market strategy and design a distribution plan from the evidence.
metadata:
  version: "1"
---

# gtm-xray

Use gtm-xray when the user asks how a startup gets customers, what a
competitor's distribution looks like, or which channels a new startup
should bet on. The answer is always evidence-backed: every finding carries
its claim, a confidence level, the evidence behind it, and explicit
limitations. Reports end with "What we could not verify".

## Connect only when needed

If gtm-xray MCP tools are available and their registration is not known to
be stale, proceed directly to the target. Do not run setup before every
investigation.

If tools are absent, read [connection and recovery](references/evidence-workflows.md).
Prefer an existing `gtmx` CLI. When none is installed and package
acquisition is within the authorized scope, use `npx -y gtm-xray` in its
place. `gtmx setup` registers the MCP server (Claude Code, Cursor, Codex)
and installs this skill; it prints every change and backs up anything it
overwrites. Setup never installs or upgrades unrelated software.

## Route the request first

- "How does X get customers?" / "Teardown X's GTM": `teardown_startup`
  with `{company, domain, depth: "full"}`. Start with `quick` only when the
  user wants a fast read.
- "What is their positioning?": `analyze_positioning` with the homepage URL.
- "What do they charge?": `analyze_pricing` with the pricing page URL.
- "Which channels do they use?": `map_channels` with the domain.
- "What growth loops do they have?": `find_acquisition_loops` with the domain.
- "Which channels should my startup bet on?": `build_distribution_plan`
  with `{startup, icp, price_point, motion, teardowns}`. Teardowns come
  from `teardown_startup` runs: pass each company's channels, loops, and
  price point as summaries. Without teardown summaries the plan says so
  and scores competitor proof at 0.

## Read the evidence, not just the claim

Every tool returns `{findings, limitations, generated_at}`. Findings carry
`confidence` (`high` = read directly from a fetched page, `medium` =
indirect signal, `low` = JS-rendered or failed fetch) and `evidence` items
with the URL observed and the snippet seen. Present confidence alongside
the claim. Never upgrade a `low` finding in your summary; quote the
limitation instead.

When a page looks JS-rendered, say which sections are degraded rather
than filling them in. When a fetch fails, record it; do not retry more
than once per URL.

## Plan broader investigations

For "who is winning distribution in category Y":

1. List the 3-5 visible competitors and run `teardown_startup` on each.
   These calls are independent; batch them.
2. Compare the channel tables: which channels appear in most teardowns?
   That overlap is the category's proven playbook.
3. Feed the summaries into `build_distribution_plan` with the user's
   startup one-liner, ICP, price point, and motion.
4. Present the ranked bets with their reasons, first experiments, and
   risks. End with what could not be verified (paid spend, review-site
   presence) and the manual checks for each.

## Read only the relevant guide

- Channel taxonomy, evidence rules, and the plan scoring formula:
  [references/methodology.md](references/methodology.md)
- Evidence workflows: confidence levels, JS-rendered pages, fetch
  failures, connection recovery:
  [references/evidence-workflows.md](references/evidence-workflows.md)
- Turning teardowns into a distribution plan:
  [references/distribution-planning.md](references/distribution-planning.md)

## Finish the task

Explain findings in plain language and tie them to the returned evidence.
Name the confidence of each claim. Close with the limitations: what the
tools could not verify and the exact manual check that would verify it.
