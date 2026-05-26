/**
 * Server registration — wires all MCP tools and resources into the McpServer.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCompileTool } from './tools/compile.js';
import { registerExecuteTool } from './tools/execute.js';
import { registerValidateTool } from './tools/validate.js';
import { registerExplainTool } from './tools/explain.js';
import { registerIRSchemaResource } from './resources/ir-schema.js';
import { registerIRCacheResource } from './resources/ir-cache.js';
import { registerSemanticsResource } from './resources/semantics.js';

export function registerTools(server: McpServer): void {
  registerCompileTool(server);
  registerExecuteTool(server);
  registerValidateTool(server);
  registerExplainTool(server);
}

export function registerResources(server: McpServer): void {
  registerIRSchemaResource(server);
  registerIRCacheResource(server);
  registerSemanticsResource(server);
}
