# MCP contracts

The server speaks MCP over stdio (`gtmx mcp`, or `node dist/main.js` with
no arguments). Every tool returns the same envelope:

```json
{
  "findings": {},
  "limitations": ["..."],
  "generated_at": "2026-10-11T14:20:39.386Z"
}
```

Tool results are returned as a single JSON text block. Facets degrade
independently: a failed pricing fetch does not block channel mapping.

| Tool | Input | Returns |
| --- | --- | --- |
| `teardown_startup` | `company` (string), `domain` (string), `depth` ("quick" \| "full", default "quick") | Full teardown: positioning, pricing, channels, loops (full depth only), limitations |
| `analyze_positioning` | `url` (string) | Headline, subhead, category claim, audience signals, social proof types, with confidence and evidence |
| `analyze_pricing` | `url` (string) | Plan names, price mentions, trial/freemium signals, billing model; low confidence when JS-rendered |
| `map_channels` | `domain` (string) | Channel signals table: channel, signal, confidence, evidence URLs |
| `find_acquisition_loops` | `domain` (string) | Detected loops: free tools, templates, share artifacts, referral terms, open source, API docs |
| `build_distribution_plan` | `startup` (string), `icp` (string), `price_point` (number \| null), `motion` ("plg" \| "sales" \| "hybrid" \| "unknown"), `teardowns` (array of `{company, channels[], loops[], price_point?}`) | Ranked channel bets with score, reasons, cost, time to signal, first experiment, risks |

Server instructions advertised to clients:

> gtm-xray reverse-engineers startups' go-to-market strategies from their
> public web surface. Every finding carries evidence, a confidence level,
> and limitations; results end with what could not be verified.
