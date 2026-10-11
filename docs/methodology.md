# Methodology

How gtm-xray reverse-engineers go-to-market strategy, and the rules every
finding follows.

## What a teardown is

A teardown answers one question: "This company is winning. How exactly do
they get customers, down to the channel level?" It does this from the
company's public web surface only: homepage, pricing page, sitemap, footer
and nav links, and a handful of well-known paths (`/affiliates`,
`/careers`, `/llms.txt`, ...). No scraping of review sites, no ad-spend
estimates, no guessing. What cannot be observed is recorded as a
limitation, not filled in.

## Channel taxonomy

Each channel is a bet a company makes with time or money. gtm-xray detects
the ones visible from the outside:

| Channel | What we look for |
| --- | --- |
| SEO / content | Sitemap scale: URL counts under `/blog/*`, `/docs/*`, `/templates/*`, `/customers/*`, `/changelog/*` |
| Social (organic) | Social profile links in nav/footer, by platform |
| Community | Discord, Slack, Skool, or forum links |
| Integrations / marketplaces | `/integrations`, app directory, marketplace, or templates links |
| Affiliates / referrals | A live page at `/affiliates`, `/referral`, or `/partners` |
| Outbound / sales hiring | Open sales, marketing, growth, or partnerships roles on `/careers` or `/jobs` |
| Agent surfaces | `llms.txt` or `/.well-known/` present: the company is courting AI agents as a channel |
| Paid acquisition | Not observable from the site; always recorded as a limitation with a manual check (Meta Ad Library, Google Ads Transparency Center) |
| Review sites | Not fetchable reliably; always recorded as a limitation with a manual check (G2, Capterra) |

## Acquisition loops

Loops are product mechanics that acquire users without a media budget:
free tools (each one an SEO landing page), templates galleries, public
share artifacts (a booking page, a form, an embed that carries the brand),
referral or affiliate terms, open source as distribution, and API or
developer docs that turn integrators into a channel.

## Evidence rules

These rules are the product. They are enforced in the types
(`src/gtm/evidence.ts`) and in the report renderer:

1. Every finding carries `{claim, confidence, evidence, limitations}`.
2. Confidence is `high` only when the signal was read directly from a
   fetched page. `medium` means the signal is indirect (copy mention,
   link presence). `low` means the page looked JS-rendered or the fetch
   failed and the claim is partial.
3. Evidence items point at the URL observed and quote the snippet seen.
   No evidence, no claim above `low`.
4. Limitations are collected from every facet and rendered as the final
   report section: "What we could not verify". The renderer never invents
   evidence to fill a gap.
5. Fetches never throw on HTTP errors. A 403 or a timeout becomes a
   limitation, not a crash.

## Distribution plan scoring

`build_distribution_plan` ranks channel bets for a new startup with a
fixed, documented formula:

```
score = icpFit (0-3) + intentLevel (0-2) + competitorProof (0-2) + speedBonus (0-1)
```

- **icpFit (0-3):** how well the channel reaches the stated ICP. Keyword
  matches between the ICP description and the channel's audience profile,
  plus whether the channel fits the stated motion (PLG, sales, hybrid).
  A motion-mismatched channel scores 0.
- **intentLevel (0-2):** fixed per channel. Search and outbound are 2
  (the prospect is already looking); social and community are 1.
- **competitorProof (0-2):** how many of the supplied teardown summaries
  show a competitor investing in this channel. 2+ teardowns = 2, one = 1,
  none = 0. This is why teardowns are the input: the plan cites observed
  competitor behavior, not generic advice.
- **speedBonus (0-1):** 1 when the channel returns a readable signal in
  days to weeks (social, community, outbound, paid, agent surfaces).

Maximum score is 8. Every bet ships with 2-3 concrete reasons (citing
teardown evidence where it exists), an expected cost, time to signal, one
first experiment, and risks. When no teardowns are supplied, the plan says
so in its limitations and competitorProof is 0 across the board.
