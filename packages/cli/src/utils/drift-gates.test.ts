import { describe, it, expect } from 'vitest';
import { DriftGatesResolver } from './drift-gates.js';

describe('DriftGatesResolver (Config G10)', () => {
  const resolver = new DriftGatesResolver();

  it('defaults to no gates when config is empty', () => {
    expect(resolver.resolve(undefined)).toEqual({
      effectiveConfigSnapshot: null,
      failOnConfigDrift: false,
      failOnGeneratedDrift: false,
      pinIrSchemaVersion: null,
    });
  });

  it('enables failOnConfigDrift by default when a snapshot path is set', () => {
    expect(
      resolver.resolve({
        effectiveConfigSnapshot: '.manifest/effective-config.snapshot.json',
      }),
    ).toEqual({
      effectiveConfigSnapshot: '.manifest/effective-config.snapshot.json',
      failOnConfigDrift: true,
      failOnGeneratedDrift: false,
      pinIrSchemaVersion: null,
    });
  });

  it('lets CLI overrides win over config', () => {
    expect(
      resolver.resolve(
        {
          effectiveConfigSnapshot: 'snap.json',
          failOnGeneratedDrift: false,
          pinIrSchemaVersion: '1.0',
        },
        { failOnGeneratedDrift: true, pinIrSchemaVersion: '1.1' },
      ),
    ).toEqual({
      effectiveConfigSnapshot: 'snap.json',
      failOnConfigDrift: true,
      failOnGeneratedDrift: true,
      pinIrSchemaVersion: '1.1',
    });
  });

  it('allows explicitly disabling config drift while keeping the snapshot path', () => {
    expect(
      resolver.resolve({
        effectiveConfigSnapshot: 'snap.json',
        failOnConfigDrift: false,
      }).failOnConfigDrift,
    ).toBe(false);
  });
});
