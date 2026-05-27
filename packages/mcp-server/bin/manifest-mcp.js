#!/usr/bin/env node

/**
 * Manifest MCP Server — stdio transport entry point.
 *
 * Usage:
 *   npx --package @angriff36/manifest manifest-mcp
 *   manifest-mcp   (after npm install @angriff36/manifest)
 *   node ./bin/manifest-mcp.js
 *
 * Configure in Claude Desktop settings:
 *   {
 *     "mcpServers": {
 *       "manifest": {
 *         "command": "npx",
 *         "args": ["--package", "@angriff36/manifest", "manifest-mcp"]
 *       }
 *     }
 *   }
 */

import { startServer } from '../dist/index.js';

startServer().catch((error) => {
  console.error('Manifest MCP server error:', error);
  process.exit(1);
});
