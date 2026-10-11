#!/usr/bin/env node
/**
 * main.ts: entry point for both the CLI and the MCP server.
 * - `gtmx <command> ...` or `node dist/main.js <command> ...` runs the CLI.
 * - No subcommand (how MCP clients spawn the process) starts the stdio MCP server.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server/createServer.js";
import { runCli } from "./cli.js";

const CLI_COMMANDS = new Set([
  "teardown",
  "positioning",
  "pricing",
  "channels",
  "loops",
  "plan",
  "setup",
  "mcp",
  "--help",
  "-h",
  "help",
]);

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  if (argv.length > 0 && CLI_COMMANDS.has(argv[0] ?? "")) {
    try {
      await runCli(argv);
    } catch (err) {
      console.error(`gtmx: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    return;
  }
  if (argv.length > 0) {
    console.error(
      `gtmx: unknown command "${argv[0]}". Run \`gtmx --help\` for usage.`,
    );
    process.exit(1);
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

void main();
