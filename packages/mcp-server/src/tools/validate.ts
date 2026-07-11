/**
 * validate tool — validate .manifest source and return diagnostics.
 *
 * Lightweight check that does NOT cache the IR. Use compile if you need
 * to subsequently execute commands.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compileToIR } from '@angriff36/manifest/ir-compiler';

export const validateInputSchema = {
  source: z.string().describe('The .manifest source text to validate'),
  sourcePath: z.string().optional().describe('Optional file path for diagnostic messages'),
};

export async function handleValidate(args: { source: string; sourcePath?: string }) {
  const result = await compileToIR(args.source, {
    useCache: false,
    sourcePath: args.sourcePath,
  });

  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

  return {
    valid: errors.length === 0 && result.ir !== null,
    diagnostics: result.diagnostics,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

export function registerValidateTool(server: McpServer): void {
  server.tool(
    'validate',
    'Validate Manifest DSL source without caching IR. Returns diagnostics (errors, warnings). Use compile if you need to execute commands afterwards.',
    validateInputSchema,
    async (args) => {
      const result = await handleValidate(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
