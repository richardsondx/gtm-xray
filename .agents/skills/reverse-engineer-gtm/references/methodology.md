# Methodology summary

Condensed from `docs/methodology.md`. The full doc is authoritative.

## Channel taxonomy

| Channel | Signal source |
| --- | --- |
| SEO / content | Sitemap URL counts under `/blog/*`, `/docs/*`, `/templates/*`, `/customers/*`, `/changelog/*` |
| Social (organic) | Social profile links in nav/footer |
| Community | Discord, Slack, Skool, forum links |
| Integrations / marketplaces | `/integrations`, app directory, marketplace, templates links |
| Affiliates / referrals | Live page at `/affiliates`, `/referral`, `/partners` |
| Outbound / sales hiring | Open GTM roles on `/careers` or `/jobs` |
| Agent surfaces | `llms.txt` or `/.well-known/` present |
| Paid acquisition | Not observable; always a limitation (check Meta Ad Library, Google Ads Transparency Center) |
| Review sites | Not fetchable; always a limitation (check G2, Capterra manually) |

## Acquisition loops

Free tools, templates galleries, public share artifacts, referral or
affiliate terms, open source as distribution, API/developer docs.

## Evidence rules

1. Every finding: `{claim, confidence, evidence, limitations}`.
2. `high` = read directly from a fetched page. `medium` = indirect signal.
   `low` = JS-rendered or failed fetch.
3. No evidence, no claim above `low`.
4. Limitations render as the final section: "What we could not verify".
5. Fetches never throw on HTTP errors; failures become limitations.

## Plan scoring

```
score = icpFit (0-3) + intentLevel (0-2) + competitorProof (0-2) + speedBonus (0-1)
```

- icpFit: keyword match between ICP and channel audience, gated on motion fit.
- intentLevel: fixed per channel (search/outbound 2, social/community 1).
- competitorProof: teardowns showing the channel (2+ = 2, one = 1, none = 0).
- speedBonus: 1 when signal reads in days to weeks.
