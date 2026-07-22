/**
 * Unit proofs for health probe emission helpers (live vs stub paths).
 */

import { describe, it, expect } from 'vitest';
import {
  emitCheckIR,
  emitHealthProbesTypes,
  emitOutboxCheck,
  emitStoreCheck,
  MEMORY_TARGETS,
} from './probe-emit';

describe('health probe-emit', () => {
  it('emits HealthProbes + configureHealthProbes', () => {
    const code = emitHealthProbesTypes().join('\n');
    expect(code).toContain('export interface HealthProbes');
    expect(code).toContain('getLiveContentHash');
    expect(code).toContain('checkStore');
    expect(code).toContain('getOutboxDepth');
    expect(code).toContain('export function configureHealthProbes');
  });

  it('IR check compares live hash when provided', () => {
    const code = emitCheckIR().join('\n');
    expect(code).toContain('getLiveContentHash');
    expect(code).toContain('IR contentHash mismatch');
    expect(code).toContain('stub: true');
  });

  it('memory store skips probe injection', () => {
    expect(MEMORY_TARGETS.has('memory')).toBe(true);
    const code = emitStoreCheck('memory', 'Memory').join('\n');
    expect(code).not.toContain('checkStore');
    expect(code).toContain('always available');
  });

  it('postgres store uses checkStore then stub fallback', () => {
    const code = emitStoreCheck('postgres', 'Postgres').join('\n');
    expect(code).toContain("probes.checkStore('postgres')");
    expect(code).toContain('scaffolding');
  });

  it('outbox uses getOutboxDepth then stub fallback', () => {
    const code = emitOutboxCheck().join('\n');
    expect(code).toContain('getOutboxDepth');
    expect(code).toContain('depth: null');
  });
});
