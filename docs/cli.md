# CLI reference

All commands accept `--json` (machine-readable envelope instead of
Markdown) and `--out <file>` (write to a file instead of stdout).

## teardown

Full reverse-engineering pass for one company.

```sh
gtmx teardown cal.com cal.com --depth full --out teardown.md
```

- `company`: display name, used in the report header.
- `domain`: `cal.com` or `https://cal.com`.
- `--depth quick` (default): positioning, pricing, channels. `--depth full`
  also detects acquisition loops.
- The report opens with a verdict: motion, strongest channel, pricing
  at a glance, who they sell to, and what to copy first, then ranked
  channels, loops, three next experiments, and what could not be
  verified. Confidence is written in plain words: Seen directly,
  Inferred, or Not verified.
- Rendered pricing is now inside teardown, not only a side command:
  when fetch-only pricing finds no priced plans, teardown runs the
  Playwright renderer on the pricing page and uses the paired monthly
  plus annual result, labelled rendered. `--render` forces rendered
  pricing, `--no-render` disables it. On a machine without Chromium
  installed, teardown records that as a limitation and the fetch-only
  result stands; it does not guess prices.

## positioning

Hero headline, subhead, category claim, audience signals, social proof.

```sh
gtmx positioning https://cal.com
```

## pricing

Plan names, price mentions, trial/freemium signals, billing model. Accepts
a domain (finds `/pricing` automatically) or a full URL.

```sh
gtmx pricing cal.com
gtmx pricing https://cal.com/pricing --json
```

## render-pricing

Rendered pricing, board item 1. Loads the pricing page in a real
Chromium browser via Playwright and captures rendered DOM, visible
text, a full-page screenshot, network requests, detected analytics
tags, and affiliate tooling. If an annual billing toggle exists, it
clicks it and captures that view as a second snapshot, with its own
screenshot, but only when the toggle actually changes visible text.
The monthly and annual views are merged into one paired finding,
never by discarding the monthly view. The report also includes the
fetch-only pricing result for comparison, so a rendered price is
never presented without showing what fetch-only saw. Tags are
detected only from network requests that returned 2xx, and are
labelled request observed, use not proven, because a script loading
does not prove ads work. If Chromium is not installed, the command
says so and tells you to run `npx playwright install chromium`; it
does not guess prices. Rendered capture refuses private network
addresses and never signs in, submits a form, or buys anything.

```sh
gtmx render-pricing higgsfield.ai --screenshot pricing.png
gtmx render-pricing https://higgsfield.ai/pricing --json
```

## channels

Map visible acquisition channels for a domain.

```sh
gtmx channels cal.com --out channels.md
```

## loops

Detect product-led acquisition loops for a domain.

```sh
gtmx loops cal.com
```

## plan

Rank channel bets for a new startup from teardown summaries.

```sh
gtmx plan \
  --startup "One-click scheduling for remote teams" \
  --icp "Ops managers at remote-first startups, 20-200 people" \
  --price 15 --motion plg \
  --teardown '{"company":"Cal.com","channels":["SEO / content","Integrations / marketplaces"],"loops":["Templates gallery"],"price_point":15}' \
  --out plan.md
```

`--teardown` takes a JSON object and is repeatable. `--teardown-file
teardowns.json` takes a JSON array of the same objects. Fields:
`company` (string), `channels` (string[]), `loops` (string[]),
`price_point` (number or null).

## setup

Register the MCP server and install the skill.

```sh
gtmx setup            # project-local skill: ./.agents/skills/reverse-engineer-gtm
gtmx setup --global   # skill goes to ~/.agents/skills
```

## mcp

Starts the MCP server over stdio (what agent clients spawn). Running
`gtmx` with no subcommand does the same.
