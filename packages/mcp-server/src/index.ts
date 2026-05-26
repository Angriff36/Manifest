/**
 * Manifest MCP Server
 *
 * Entry point for the Model Context Protocol server that exposes Manifest
 * compilation, execution, validation, and introspection as typed MCP tools
 * and resources.
 *
 * Usage:
 *   npx @manifest/mcp-server
 *   node ./bin/manifest-mcp.js
 *
 * Tools:
 *   compile  — Compile .manifest source to IR
 *   execute  — Execute a command against compiled IR
 *   validate — Validate .manifest source (diagnostics only)
 *   explain  — Explain an IR entity/command/policy
 *
 * Resources:
 *   manifest://ir/schema       — IR JSON Schema
 *   manifest://ir/{contentHash} — Cached compiled IR
 *   manifest://semantics       — Language semantics reference
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools, registerResources } from './server.js';

export async function startServer(): Promise<void> {
  const server = new McpServer({
    name: 'manifest-mcp-server',
    version: '0.1.0',
  });

  registerTools(server);
  registerResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
