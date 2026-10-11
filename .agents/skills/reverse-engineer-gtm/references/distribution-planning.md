# Distribution planning

How to turn teardowns into a channel plan for a new startup.

## Inputs

`build_distribution_plan` needs:

- `startup`: one-liner, e.g. "One-click scheduling for remote teams".
- `icp`: one sentence, e.g. "Ops managers at remote-first startups,
  20-200 people".
- `price_point`: monthly USD, or null when unknown.
- `motion`: `plg`, `sales`, `hybrid`, or `unknown`.
- `teardowns`: one summary per competitor, each with `company`,
  `channels[]`, `loops[]`, and `price_point`. Build these from
  `teardown_startup` runs; use the channel names from the channel table
  (e.g. "SEO / content", "Integrations / marketplaces").

## Reading the output

Bets are ranked by `score` (0-8). The top bets are not a to-do list; they
are an order of experiments. Each bet includes:

- **why**: 2-3 concrete reasons. When teardown evidence exists, the first
  reason names the competitors investing in the channel.
- **expectedCost** and **timeToSignal**: plan the budget and the calendar
  around these, not around the score.
- **firstExperiment**: one concrete action, small enough to run this week.
- **risks**: what makes this channel fail for startups like this one.

## Rules

- Never present a bet without its risks and its time to signal.
- When `competitorProof` is 0 (no teardowns supplied), say so; the ranking
  then leans on ICP fit and speed, and the plan records it as a
  limitation.
- Motion mismatches score icpFit 0: do not recommend outbound for a PLG
  motion unless the user overrides the motion.
- Paid acquisition always carries high expected cost; only recommend it
  with a kill rule (the default first experiment includes one: kill unless
  signup CAC lands under a third of expected LTV).
- End with "What we could not verify": paid spend and review-site
  presence are never in the data, so name the manual checks.
