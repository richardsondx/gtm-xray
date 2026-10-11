# Evidence workflows

## Confidence levels

- **high**: the claim was read directly from a fetched page (a headline,
  a linked profile, a sitemap count). Quote the snippet.
- **medium**: the signal is indirect. A community link exists but you did
  not see member counts. Copy mentions share artifacts but you did not see
  a live public example. Present the claim with the caveat attached.
- **low**: the page looked JS-rendered, the fetch failed, or the signal
  was absent and you are reporting the absence. Never present a `low`
  finding as established fact.

## JS-rendered pages

gtm-xray flags pages whose body has under ~120 words but loads app
bundles. When flagged:

- Mark affected findings `low` and add the limitation to the report.
- Do not describe content you could not read. Say which sections are
  degraded: "pricing page is JS-rendered; plan names are missing, price
  mentions are partial."
- Do not retry more than once per URL; a second fetch rarely changes the
  outcome.

## Fetch failures

Fetches never throw. A failed fetch returns `{status: 0, error}` and the
facet records a limitation like "Homepage fetch failed (timeout after
15000ms); no channel signals could be collected." Other facets continue.
If every facet fails, the report is a list of limitations; that is a
correct result.

## Connection and recovery

If the gtm-xray MCP tools are missing from your client:

1. Check whether `gtmx` exists on PATH (`which gtmx`).
2. If yes, your client's MCP config likely points at a stale path; run
   `gtmx setup` and restart the client.
3. If no and package acquisition is authorized, use `npx -y gtm-xray`
   (CLI) or `npx -y gtm-xray mcp` (server) directly.
4. `gtmx setup` registers `gtm-xray` in `~/.claude.json`,
   `~/.cursor/mcp.json`, and `~/.codex/config.toml`, and copies this
   skill to `./.agents/skills/reverse-engineer-gtm` (or `~/.agents/skills`
   with `--global`). It prints every change and writes `.bak` backups
   before overwriting.

Do not reinstall Node, npm, or unrelated tooling as part of gtm-xray
setup.
