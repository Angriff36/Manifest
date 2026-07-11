/**
 * Generate framework-neutral TypeScript bindings from a WiringContract.
 * Client types exclude server-owned fields; server helpers strip + inject.
 */

import type {
  WiringContract,
  WiringCommandDescriptor,
  WiringParameterDescriptor,
} from './types.js';

function pascal(entity: string, command: string): string {
  const e = entity === '_program' ? '' : entity;
  return `${e}${command[0].toUpperCase()}${command.slice(1)}`;
}

function emitClientInputType(cap: WiringCommandDescriptor): string {
  const name = `${pascal(cap.entity, cap.command)}ClientInput`;
  const clientParams = cap.parameters.filter((p) => p.ownership === 'client');
  if (clientParams.length === 0) {
    return `export type ${name} = Record<string, never>;`;
  }
  const fields = clientParams.map((p) => paramField(p)).join('\n');
  return `export interface ${name} {\n${fields}\n}`;
}

function paramField(p: WiringParameterDescriptor): string {
  const opt = p.required ? '' : '?';
  let ts = p.tsType;
  // Required date-like: exclude empty string at the type level when wire is string.
  if (
    p.constraints.rejectEmptyString &&
    p.required &&
    (ts === 'string' || ts.startsWith('string'))
  ) {
    ts = 'string & {}'; // non-empty brand hint; runtime still validates
  }
  const lines = [`  ${p.name}${opt}: ${ts};`];
  if (p.constraints.enumValues?.length) {
    lines.unshift(
      `  /** Allowed: ${p.constraints.enumValues.map((v) => JSON.stringify(v)).join(' | ')} */`,
    );
  }
  if (p.constraints.min !== undefined || p.constraints.max !== undefined) {
    lines.unshift(`  /** Bounds: ${p.constraints.min ?? '-∞'}..${p.constraints.max ?? '∞'} */`);
  }
  if (p.constraints.nonEmpty) {
    lines.unshift('  /** Non-empty string required (static). */');
  }
  if (p.constraints.rejectEmptyString) {
    lines.unshift('  /** Must not be "". */');
  }
  return lines.join('\n');
}

function emitServerContextType(cap: WiringCommandDescriptor): string | null {
  const serverParams = cap.parameters.filter((p) => p.ownership === 'server');
  if (serverParams.length === 0) return null;
  const name = `${pascal(cap.entity, cap.command)}TrustedContext`;
  const fields = serverParams
    .map((p) => {
      const path = p.trustedSource ?? 'context';
      return `  /** Injected from ${path} */\n  ${p.name}: ${p.tsType};`;
    })
    .join('\n');
  return `export interface ${name} {\n${fields}\n}`;
}

function emitBindFunction(cap: WiringCommandDescriptor): string {
  const base = pascal(cap.entity, cap.command);
  const clientType = `${base}ClientInput`;
  const hasServer = cap.serverParameterNames.length > 0;
  const trustedType = `${base}TrustedContext`;
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * Build command input for ${cap.capabilityId}.`);
  lines.push(` * Client fields only; server-owned fields are injected separately.`);
  lines.push(` */`);
  if (hasServer) {
    lines.push(
      `export function bind${base}Input(client: ${clientType}, trusted: ${trustedType}): Record<string, unknown> {`,
    );
    lines.push(`  const { ${cap.serverParameterNames.join(', ')} } = trusted;`);
    lines.push(`  // Strip any spoofed server-owned keys from the client payload.`);
    lines.push(`  const safeClient = { ...client } as Record<string, unknown>;`);
    for (const name of cap.serverParameterNames) {
      lines.push(`  delete safeClient[${JSON.stringify(name)}];`);
    }
    lines.push(`  return {`);
    lines.push(`    ...safeClient,`);
    for (const name of cap.serverParameterNames) {
      lines.push(`    ${name},`);
    }
    lines.push(`  };`);
    lines.push(`}`);
  } else {
    lines.push(
      `export function bind${base}Input(client: ${clientType}): Record<string, unknown> {`,
    );
    lines.push(`  return { ...client };`);
    lines.push(`}`);
  }

  lines.push('');
  lines.push(`/** Invalidation targets after a successful ${cap.capabilityId}. */`);
  lines.push(
    `export const ${base}Invalidation = ${JSON.stringify(cap.invalidation, null, 2)} as const;`,
  );

  if (cap.lifecycleTransitions.length > 0) {
    lines.push('');
    lines.push(`/** Proven lifecycle transitions for ${cap.capabilityId}. */`);
    lines.push(
      `export const ${base}Lifecycle = ${JSON.stringify(cap.lifecycleTransitions, null, 2)} as const;`,
    );
  }

  return lines.join('\n');
}

function emitCapabilityConst(cap: WiringCommandDescriptor): string {
  const base = pascal(cap.entity, cap.command);
  return [
    `export const ${base}Capability = {`,
    `  capabilityId: ${JSON.stringify(cap.capabilityId)},`,
    `  entity: ${JSON.stringify(cap.entity)},`,
    `  command: ${JSON.stringify(cap.command)},`,
    `  route: ${JSON.stringify(cap.route)},`,
    `  instanceCommand: ${cap.instanceCommand},`,
    `  clientParameterNames: ${JSON.stringify(cap.clientParameterNames)},`,
    `  serverParameterNames: ${JSON.stringify(cap.serverParameterNames)},`,
    `  emits: ${JSON.stringify(cap.emits)},`,
    `} as const;`,
  ].join('\n');
}

/**
 * Emit TypeScript bindings module source from a wiring contract.
 */
export function generateWiringBindings(contract: WiringContract): string {
  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * Generated Manifest product-wiring bindings.');
  lines.push(' * DO NOT EDIT — regenerate from IR via the wiring projection.');
  lines.push(' *');
  lines.push(' * This module does NOT generate UI. It provides typed client inputs,');
  lines.push(' * trusted-context injection helpers, and invalidation metadata.');
  lines.push(' */');
  lines.push('');
  lines.push(`export const WIRING_CONTRACT_HASH = ${JSON.stringify(contract.meta.contentHash)};`);
  lines.push('');

  for (const cap of contract.capabilities) {
    lines.push(`// --- ${cap.capabilityId} ---`);
    lines.push(emitClientInputType(cap));
    lines.push('');
    const trusted = emitServerContextType(cap);
    if (trusted) {
      lines.push(trusted);
      lines.push('');
    }
    lines.push(emitCapabilityConst(cap));
    lines.push('');
    lines.push(emitBindFunction(cap));
    lines.push('');
  }

  lines.push('/** All capability ids in this contract (sorted). */');
  lines.push(
    `export const ALL_CAPABILITY_IDS = ${JSON.stringify(
      contract.capabilities.map((c) => c.capabilityId),
      null,
      2,
    )} as const;`,
  );
  lines.push('');

  return lines.join('\n');
}
