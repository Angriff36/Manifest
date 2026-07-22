/**
 * Unit tests for Config G4 provenance policy.
 */

import { describe, expect, it } from 'vitest';
import {
  DETERMINISTIC_COMPILED_AT,
  buildProvenanceLockfile,
  checkProvenanceLockfileStale,
  resolveCompiledAt,
  resolveProvenanceConfig,
} from './provenance-config.js';
import { compileToIR } from './ir-compiler.js';

describe('resolveProvenanceConfig', () => {
  it('defaults to stamp on, non-deterministic, no lockfile', () => {
    expect(resolveProvenanceConfig(undefined)).toEqual({
      stamp: true,
      fields: ['sourceHash', 'generatorVersion', 'irSchemaVersion', 'gitSha'],
      deterministic: false,
      lockfile: undefined,
      failIfStale: false,
    });
  });

  it('honors deterministic + lockfile + failIfStale', () => {
    const resolved = resolveProvenanceConfig({
      deterministic: true,
      lockfile: '.manifest/provenance.lock.json',
      failIfStale: true,
      stamp: true,
      fields: ['sourceHash', 'generatorVersion'],
    });
    expect(resolved.deterministic).toBe(true);
    expect(resolved.lockfile).toBe('.manifest/provenance.lock.json');
    expect(resolved.failIfStale).toBe(true);
    expect(resolved.fields).toEqual(['sourceHash', 'generatorVersion']);
  });
});

describe('resolveCompiledAt', () => {
  it('returns fixed epoch when deterministic', () => {
    expect(resolveCompiledAt(true)).toBe(DETERMINISTIC_COMPILED_AT);
  });

  it('uses injected now when not deterministic', () => {
    expect(resolveCompiledAt(false, () => '2026-07-22T00:00:00.000Z')).toBe(
      '2026-07-22T00:00:00.000Z',
    );
  });
});

describe('checkProvenanceLockfileStale', () => {
  const base = {
    contentHash: 'abc',
    irHash: 'ir1',
    compilerVersion: '1.0.0',
    schemaVersion: 'ir-v1',
    compiledAt: DETERMINISTIC_COMPILED_AT,
  };

  it('is not stale when sources changed', () => {
    expect(
      checkProvenanceLockfileStale(buildProvenanceLockfile(base), { ...base, contentHash: 'xyz' }, {
        deterministic: true,
      }),
    ).toBeNull();
  });

  it('fails when contentHash matches but irHash drifts under deterministic', () => {
    const msg = checkProvenanceLockfileStale(
      buildProvenanceLockfile(base),
      { ...base, irHash: 'ir2' },
      { deterministic: true },
    );
    expect(msg).toMatch(/PROVENANCE_STALE/);
  });

  it('ignores irHash drift when not deterministic', () => {
    expect(
      checkProvenanceLockfileStale(
        buildProvenanceLockfile(base),
        { ...base, irHash: 'ir2' },
        { deterministic: false },
      ),
    ).toBeNull();
  });
});

describe('compileToIR deterministicProvenance', () => {
  const src = `
    entity User {
      property name: string
    }
  `;

  it('stamps fixed compiledAt and stable irHash across runs', async () => {
    const a = await compileToIR(src, { useCache: false, deterministicProvenance: true });
    const b = await compileToIR(src, { useCache: false, deterministicProvenance: true });
    expect(a.ir).not.toBeNull();
    expect(b.ir).not.toBeNull();
    expect(a.ir!.provenance.compiledAt).toBe(DETERMINISTIC_COMPILED_AT);
    expect(a.ir!.provenance.irHash).toBe(b.ir!.provenance.irHash);
  });
});
