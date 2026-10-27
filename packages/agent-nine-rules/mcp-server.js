#!/usr/bin/env node

/**
 * Executable entrypoint for the Agent Nine Rules MCP Server.
 * Communicates with MCP clients via stdio (standard input/output) using JSON-RPC 2.0.
 *
 * Usage:
 *   node packages/agent-nine-rules/mcp-server.js
 *
 * Or in an MCP client configuration (e.g. Claude Desktop, Cursor, Antigravity):
 * {
 *   "mcpServers": {
 *     "agent-nine-rules": {
 *       "command": "node",
 *       "args": ["<path-to-workspace>/packages/agent-nine-rules/mcp-server.js"]
 *     }
 *   }
 * }
 */

const { NineRulesMcpServer, TOOL_NAME, TOOL_DEFINITION } = require('./mcp');

const server = new NineRulesMcpServer();

if (require.main === module) {
    server.startStdioTransport();
}

module.exports = {
    NineRulesMcpServer,
    server,
    TOOL_NAME,
    TOOL_DEFINITION
};
