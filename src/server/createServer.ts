/**
 * createServer.ts: builds the gtm-xray MCP server. One McpServer from the
 * official SDK, stdio transport wired in main.ts, and the six GTM tools
 * registered here. No sessions, no providers, no subprocesses.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGtmTools } from "./registerGtmTools.js";

export const SERVER_NAME = "gtm-xray";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS =
  "gtm-xray reverse-engineers startups' go-to-market strategies from their " +
  "public web surface. Every finding carries evidence, a confidence level, " +
  "and limitations; results end with what could not be verified. Use " +
  "teardown_startup for a full reverse-engineering pass, the focused tools " +
  "for one facet, and build_distribution_plan to rank channel bets for a " +
  "new startup from teardown evidence.";

/** Construct the MCP server with all GTM tools registered. */
export const createServer = (): McpServer => {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: {}, instructions: INSTRUCTIONS },
  );
  registerGtmTools(server);
  return server;
};
