/**
 * Emitted probe bodies for the health.handler surface.
 *
 * Live checks run when the host injects `HealthProbes` (argument or
 * `configureHealthProbes`). Without probes, non-memory checks stay honest stubs.
 */

/** Store targets that are always in-process healthy. */
export const MEMORY_TARGETS = new Set(['memory', 'localStorage']);

export function emitHealthProbesTypes(): string[] {
  return [
    '/** Host-injected live probes. Omit to keep scaffolding stubs. */',
    'export interface HealthProbes {',
    '  /** Compare against baked MANIFEST_IR_META.contentHash. */',
    '  getLiveContentHash?: () => string | Promise<string>;',
    '  /** Probe a store target (postgres, supabase, …). */',
    '  checkStore?: (target: string) => Promise<ComponentHealth>;',
    '  /** Pending outbox depth (postgres/supabase outbox tables). */',
    '  getOutboxDepth?: () => Promise<number>;',
    '}',
    '',
    'let configuredProbes: HealthProbes | undefined;',
    '',
    '/** Wire live probes once at app bootstrap (used by HTTP wrappers). */',
    'export function configureHealthProbes(probes: HealthProbes): void {',
    '  configuredProbes = probes;',
    '}',
    '',
  ];
}

export function emitCheckIR(): string[] {
  return [
    '/**',
    ' * IR integrity: live hash compare when getLiveContentHash is provided;',
    ' * otherwise reports baked provenance with stub: true.',
    ' */',
    'async function checkIR(probes?: HealthProbes): Promise<ComponentHealth> {',
    '  const live = probes?.getLiveContentHash;',
    '  if (!live) {',
    '    return {',
    "      status: 'healthy',",
    "      message: 'IR provenance baked (not live-checked)',",
    '      details: { ...MANIFEST_IR_META, stub: true },',
    '    };',
    '  }',
    '  try {',
    '    const hash = await live();',
    '    if (hash === MANIFEST_IR_META.contentHash) {',
    '      return {',
    "        status: 'healthy',",
    "        message: 'IR contentHash matches live hash',",
    '        details: { ...MANIFEST_IR_META, stub: false, live: true },',
    '      };',
    '    }',
    '    return {',
    "      status: 'unhealthy',",
    "      message: 'IR contentHash mismatch',",
    '      details: { ...MANIFEST_IR_META, stub: false, live: true, liveContentHash: hash },',
    '    };',
    '  } catch (err: unknown) {',
    '    const message = err instanceof Error ? err.message : String(err);',
    '    return {',
    "      status: 'unhealthy',",
    "      message: 'IR live hash probe failed: ' + message,",
    '      details: { ...MANIFEST_IR_META, stub: false, live: true },',
    '    };',
    '  }',
    '}',
    '',
  ];
}

export function emitStoreCheck(target: string, functionSuffix: string): string[] {
  const isMemory = MEMORY_TARGETS.has(target);
  const lines: string[] = [
    `/** Check connectivity for ${target} stores. */`,
    `async function check${functionSuffix}Store(probes?: HealthProbes): Promise<ComponentHealth> {`,
  ];

  if (isMemory) {
    lines.push(
      `  return { status: 'healthy', message: '${target} store is always available', details: { stub: false } };`,
    );
  } else {
    lines.push(`  if (probes?.checkStore) {`);
    lines.push(`    try {`);
    lines.push(`      const result = await probes.checkStore('${target}');`);
    lines.push(
      `      return { ...result, details: { ...(result.details ?? {}), stub: false, live: true, target: '${target}' } };`,
    );
    lines.push(`    } catch (err: unknown) {`);
    lines.push(`      const message = err instanceof Error ? err.message : String(err);`);
    lines.push(`      return {`);
    lines.push(`        status: 'unhealthy',`);
    lines.push(`        message: '${target} store probe failed: ' + message,`);
    lines.push(`        details: { stub: false, live: true, target: '${target}' },`);
    lines.push(`      };`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`  return {`);
    lines.push(`    status: 'healthy',`);
    lines.push(`    message: '${target} store check not implemented (scaffolding)',`);
    lines.push(`    details: { stub: true, target: '${target}' },`);
    lines.push(`  };`);
  }

  lines.push('}');
  lines.push('');
  return lines;
}

export function emitOutboxCheck(): string[] {
  return [
    '/**',
    ' * Outbox queue depth. Live when getOutboxDepth is provided;',
    ' * otherwise scaffolding with depth: null.',
    ' */',
    'async function checkOutbox(probes?: HealthProbes): Promise<ComponentHealth> {',
    '  if (probes?.getOutboxDepth) {',
    '    try {',
    '      const depth = await probes.getOutboxDepth();',
    '      if (depth < 0) {',
    '        return {',
    "          status: 'unhealthy',",
    "          message: 'Outbox depth probe returned a negative value',",
    '          details: { stub: false, live: true, depth },',
    '        };',
    '      }',
    '      return {',
    "        status: 'healthy',",
    "        message: 'Outbox depth queried',",
    '        details: { stub: false, live: true, depth },',
    '      };',
    '    } catch (err: unknown) {',
    '      const message = err instanceof Error ? err.message : String(err);',
    '      return {',
    "        status: 'unhealthy',",
    "        message: 'Outbox depth probe failed: ' + message,",
    '        details: { stub: false, live: true, depth: null },',
    '      };',
    '    }',
    '  }',
    '  return {',
    "    status: 'healthy',",
    "    message: 'Outbox depth not queried (scaffolding)',",
    '    details: { stub: true, depth: null },',
    '  };',
    '}',
    '',
  ];
}
