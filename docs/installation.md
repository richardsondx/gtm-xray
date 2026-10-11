# Installation

## Requirements

- Node.js 22 or 24
- npm

## Quickstart

```sh
npx gtm-xray setup
```

`setup` registers the MCP server in the agent clients it finds (Claude
Code, Cursor, Codex) and installs the `reverse-engineer-gtm` skill. It
prints every change, backs up anything it overwrites (`.bak`), and never
touches unrelated config.

## Install the CLI

```sh
npm install -g gtm-xray
gtmx teardown cal.com cal.com --depth full
```

## From source

```sh
git clone <repo>
cd gtm-xray
npm install
npm run build
node dist/main.js teardown cal.com cal.com
```

## MCP server

Agent clients spawn the server over stdio:

```sh
npx -y gtm-xray mcp
```

No arguments starts the MCP server directly (`node dist/main.js` with no
subcommand). Any network access happens only when a tool runs; nothing is
fetched at import time.

## Verify

```sh
npm run build   # tsc, must be clean
npm test        # vitest, must pass
```
