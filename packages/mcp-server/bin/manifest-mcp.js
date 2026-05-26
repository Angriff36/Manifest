#!/usr/bin/env node

/**
 * Manifest MCP Server — stdio transport entry point.
 *
 * Usage:
 *   npx @manifest/mcp-server
 *   node ./bin/manifest-mcp.js
 *
 * Configure in Claude Desktop settings:
 *   {
 *     "mcpServers": {
 *       "manifest": {
 *         "command": "npx",
 *         "args": ["@manifest/mcp-server"]
 *       }
 *     }
 *   }
 */

import { startServer } from '../dist/index.js';

startServer().catch((error) => {
  console.error('Manifest MCP server error:', error);
  process.exit(1);
});
