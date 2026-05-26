/**
 * execute tool — execute a command against a previously compiled IR.
 *
 * References a prior compile result by contentHash and runs the named
 * command through the Manifest RuntimeEngine.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sessionStore } from '../state/session-store.js';
import type { RuntimeContext } from '@angriff36/manifest';

export const executeInputSchema = {
  contentHash: z
    .string()
    .describe('SHA-256 content hash from a prior compile call'),
  commandName: z.string().describe('Name of the command to execute'),
  input: z
    .record(z.unknown())
    .describe('Command input parameters as key-value pairs'),
  entityName: z
    .string()
    .optional()
    .describe('Entity context (required for entity-scoped commands)'),
  instanceId: z
    .string()
    .optional()
    .describe('Target entity instance ID'),
  context: z
    .object({
      tenantId: z.string().optional(),
      orgId: z.string().optional(),
      actorId: z.string().optional(),
      requestId: z.string().optional(),
      source: z.string().optional(),
      user: z
        .object({
          id: z.string(),
          role: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .optional()
    .describe('Runtime context overrides (tenant, user, etc.)'),
};

export async function handleExecute(args: {
  contentHash: string;
  commandName: string;
  input: Record<string, unknown>;
  entityName?: string;
  instanceId?: string;
  context?: RuntimeContext;
}) {
  const entry = sessionStore.get(args.contentHash);
  if (!entry) {
    return {
      success: false,
      error: `No compiled IR found for contentHash '${args.contentHash}'. Run compile first.`,
      emittedEvents: [],
    };
  }

  const { engine } = entry;

  if (args.context) {
    engine.replaceContext(args.context);
  }

  const result = await engine.runCommand(args.commandName, args.input, {
    entityName: args.entityName,
    instanceId: args.instanceId,
  });

  return {
    success: result.success,
    result: result.result,
    error: result.error,
    deniedBy: result.deniedBy,
    guardFailure: result.guardFailure
      ? {
          index: result.guardFailure.index,
          expression: result.guardFailure.formatted,
          formatted: result.guardFailure.formatted,
          resolved: result.guardFailure.resolved,
        }
      : undefined,
    policyDenial: result.policyDenial
      ? {
          policyName: result.policyDenial.policyName,
          formatted: result.policyDenial.formatted,
          message: result.policyDenial.message,
        }
      : undefined,
    constraintOutcomes: result.constraintOutcomes?.map((co) => ({
      code: co.code,
      constraintName: co.constraintName,
      severity: co.severity,
      passed: co.passed,
      message: co.message,
    })),
    emittedEvents: result.emittedEvents.map((e) => ({
      name: e.name,
      channel: e.channel,
      payload: e.payload,
    })),
  };
}

export function registerExecuteTool(server: McpServer): void {
  server.tool(
    'execute',
    'Execute a Manifest command against previously compiled IR. Requires a contentHash from a prior compile call.',
    executeInputSchema,
    async (args) => {
      const result = await handleExecute(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
