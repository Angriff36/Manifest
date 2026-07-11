/**
 * compile tool — compile .manifest source to IR JSON + diagnostics.
 *
 * Wraps `compileToIR` from the Manifest core and caches the result in
 * the session store keyed by the IR's provenance contentHash.
 * The returned contentHash is used by execute and explain tools to
 * reference this compilation.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import { sessionStore } from '../state/session-store.js';

export const compileInputSchema = {
  source: z.string().describe('The .manifest source text to compile'),
  sourcePath: z.string().optional().describe('Optional file path for diagnostic messages'),
};

export async function handleCompile(args: { source: string; sourcePath?: string }) {
  const result = await compileToIR(args.source, {
    useCache: false,
    sourcePath: args.sourcePath,
  });

  const summary = {
    entityCount: 0,
    commandCount: 0,
    policyCount: 0,
    hasErrors: result.diagnostics.some((d) => d.severity === 'error'),
  };

  // Use the IR's provenance contentHash as the cache key.
  // The IR compiler already computes SHA-256 of the source.
  const contentHash = result.ir?.provenance?.contentHash ?? '';

  if (result.ir) {
    sessionStore.store(contentHash, result.ir);
    summary.entityCount = result.ir.entities.length;
    summary.commandCount = result.ir.commands.length;
    summary.policyCount = result.ir.policies.length;
  }

  return {
    contentHash,
    ir: result.ir,
    diagnostics: result.diagnostics,
    summary,
  };
}

export function registerCompileTool(server: McpServer): void {
  server.tool(
    'compile',
    'Compile Manifest DSL source to Intermediate Representation (IR). Returns IR JSON, diagnostics, and a contentHash handle for use with execute/explain tools.',
    compileInputSchema,
    async (args) => {
      const result = await handleCompile(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
