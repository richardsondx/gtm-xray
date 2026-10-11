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
