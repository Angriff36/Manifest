/**
 * explain tool — explain an IR entity, command, or policy in human-readable form.
 *
 * References a prior compile result by contentHash and formats structured
 * information about the requested target.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sessionStore } from '../state/session-store.js';
import type { IR, IREntity, IRCommand, IRPolicy, IRType } from '@angriff36/manifest/ir';

export const explainInputSchema = {
  contentHash: z
    .string()
    .describe('SHA-256 content hash from a prior compile call'),
  target: z
    .enum(['entity', 'command', 'policy'])
    .describe('Type of IR element to explain'),
  name: z.string().describe('Name of the entity, command, or policy'),
  entityName: z
    .string()
    .optional()
    .describe('Entity context (required when target is command)'),
};

function formatType(type: IRType): string {
  let result = type.name;
  if (type.generic) {
    result += `<${formatType(type.generic)}>`;
  }
  if (type.nullable) {
    result += '?';
  }
  return result;
}

function formatEntityExplanation(entity: IREntity, ir: IR): string {
  const lines: string[] = [];

  lines.push(`Entity: ${entity.name}`);
  if (entity.module) lines.push(`Module: ${entity.module}`);
  if (entity.key) lines.push(`Primary Key: [${entity.key.join(', ')}]`);
  if (entity.versionProperty)
    lines.push(`Concurrency: versioned via ${entity.versionProperty}`);

  lines.push('');
  lines.push('Properties:');
  for (const p of entity.properties) {
    const parts = [`  - ${p.name}: ${formatType(p.type)}`];
    if (p.defaultValue !== undefined) parts.push(`(default: ${JSON.stringify(p.defaultValue)})`);
    if (p.modifiers?.length) parts.push(`[${p.modifiers.join(', ')}]`);
    lines.push(parts.join(' '));
  }

  if (entity.computedProperties.length > 0) {
    lines.push('');
    lines.push('Computed Properties:');
    for (const cp of entity.computedProperties) {
      lines.push(`  - ${cp.name}: ${formatType(cp.type)} (computed)`);
    }
  }

  if (entity.relationships.length > 0) {
    lines.push('');
    lines.push('Relationships:');
    for (const r of entity.relationships) {
      lines.push(`  - ${r.kind} ${r.target}${r.name ? ` as ${r.name}` : ''}`);
    }
  }

  if (entity.commands.length > 0) {
    lines.push('');
    lines.push('Commands:');
    for (const cmdName of entity.commands) {
      const cmd = ir.commands.find(
        (c) => c.name === cmdName && c.entity === entity.name,
      );
      const params = cmd
        ? cmd.parameters.map((p) => `${p.name}: ${formatType(p.type)}`).join(', ')
        : '';
      lines.push(`  - ${cmdName}(${params})`);
    }
  }

  if (entity.constraints.length > 0) {
    lines.push('');
    lines.push('Constraints:');
    for (const c of entity.constraints) {
      lines.push(
        `  - ${c.name ?? c.code} (${c.severity ?? 'block'}): ${c.message ?? c.code}`,
      );
    }
  }

  return lines.join('\n');
}

function formatCommandExplanation(command: IRCommand): string {
  const lines: string[] = [];

  lines.push(`Command: ${command.name}`);
  if (command.entity) lines.push(`Entity: ${command.entity}`);
  if (command.module) lines.push(`Module: ${command.module}`);

  lines.push('');
  lines.push('Parameters:');
  for (const p of command.parameters) {
    lines.push(`  - ${p.name}: ${formatType(p.type)}${p.defaultValue !== undefined ? ` (default: ${JSON.stringify(p.defaultValue)})` : ''}`);
  }

  if (command.guards.length > 0) {
    lines.push('');
    lines.push('Guards (evaluated in order, first falsey halts execution):');
    command.guards.forEach((g, i) => {
      lines.push(`  ${i + 1}. ${g.formatted ?? '(expression)'}`);
    });
  }

  if (command.policies?.length) {
    lines.push('');
    lines.push('Policies:');
    for (const p of command.policies) {
      lines.push(`  - ${p}`);
    }
  }

  if (command.constraints?.length) {
    lines.push('');
    lines.push('Constraints:');
    for (const c of command.constraints) {
      lines.push(`  - ${c.name ?? c.code} (${c.severity ?? 'block'}): ${c.message ?? c.code}`);
    }
  }

  lines.push('');
  lines.push('Actions:');
  for (const a of command.actions) {
    lines.push(`  - ${a.kind}${a.target ? ` -> ${a.target}` : ''}`);
  }

  if (command.emits.length > 0) {
    lines.push('');
    lines.push('Emits:');
    for (const e of command.emits) {
      lines.push(`  - ${e}`);
    }
  }

  if (command.returns) {
    lines.push('');
    lines.push(`Returns: ${formatType(command.returns)}`);
  }

  return lines.join('\n');
}

function formatPolicyExplanation(policy: IRPolicy): string {
  const lines: string[] = [];

  lines.push(`Policy: ${policy.name}`);
  if (policy.module) lines.push(`Module: ${policy.module}`);
  lines.push(`Effect: ${policy.effect}`);

  if (policy.targets.length > 0) {
    lines.push('');
    lines.push('Targets:');
    for (const t of policy.targets) {
      lines.push(`  - ${t}`);
    }
  }

  if (policy.condition) {
    lines.push('');
    lines.push('Condition:');
    lines.push(`  ${policy.condition.formatted ?? '(expression)'}`);
  }

  return lines.join('\n');
}

export function handleExplain(args: {
  contentHash: string;
  target: 'entity' | 'command' | 'policy';
  name: string;
  entityName?: string;
}): { explanation: string; details: unknown } {
  const entry = sessionStore.get(args.contentHash);
  if (!entry) {
    return {
      explanation: `No compiled IR found for contentHash '${args.contentHash}'. Run compile first.`,
      details: {},
    };
  }

  const { ir, engine } = entry;

  if (args.target === 'entity') {
    const entity = engine.getEntity(args.name);
    if (!entity) {
      return {
        explanation: `Entity '${args.name}' not found in compiled IR. Available: ${ir.entities.map((e) => e.name).join(', ')}`,
        details: {},
      };
    }
    return {
      explanation: formatEntityExplanation(entity, ir),
      details: entity,
    };
  }

  if (args.target === 'command') {
    const command = engine.getCommand(args.name, args.entityName);
    if (!command) {
      return {
        explanation: `Command '${args.name}' not found${args.entityName ? ` on entity '${args.entityName}'` : ''}. Available: ${ir.commands.map((c) => c.name).join(', ')}`,
        details: {},
      };
    }
    return {
      explanation: formatCommandExplanation(command),
      details: command,
    };
  }

  if (args.target === 'policy') {
    const policies = engine.getPolicies();
    const policy = policies.find((p: IRPolicy) => p.name === args.name);
    if (!policy) {
      return {
        explanation: `Policy '${args.name}' not found. Available: ${policies.map((p: IRPolicy) => p.name).join(', ')}`,
        details: {},
      };
    }
    return {
      explanation: formatPolicyExplanation(policy),
      details: policy,
    };
  }

  return {
    explanation: `Unknown target type: ${args.target}`,
    details: {},
  };
}

export function registerExplainTool(server: McpServer): void {
  server.tool(
    'explain',
    'Explain a Manifest IR entity, command, or policy in human-readable form. Requires a contentHash from a prior compile call.',
    explainInputSchema,
    async (args) => {
      const result = handleExplain(args);
      return {
        content: [{ type: 'text' as const, text: result.explanation }],
      };
    },
  );
}
