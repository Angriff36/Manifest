/**
 * @manifest/stdlib test suite
 *
 * Verifies that:
 *  1. All bundled .manifest source files are non-empty and well-formed
 *  2. The catalog metadata is consistent
 *  3. A real Manifest program can include a stdlib file and compile successfully
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from '@angriff36/manifest/ir-compiler';
import {
  moneySource,
  addressSource,
  emailSource,
  phoneSource,
  auditTrailSource,
  statusEnumSource,
  priorityEnumSource,
  auditActionEnumSource,
  timestampedArchetypeSource,
  softDeletableArchetypeSource,
  ownedArchetypeSource,
  auditableArchetypeSource,
  stateMachineArchetypeSource,
  ARCHETYPES,
  VALUE_OBJECTS,
  ENUMS,
  VERSION,
  manifestPath,
} from './index';

describe('@manifest/stdlib catalog', () => {
  it('exposes a stable version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ships all five archetypes', () => {
    const names = ARCHETYPES.map(a => a.name);
    expect(names).toEqual([
      'Timestamped',
      'SoftDeletable',
      'Owned',
      'Auditable',
      'StateMachine',
    ]);
  });

  it('ships all five value objects', () => {
    const names = VALUE_OBJECTS.map(v => v.name);
    expect(names).toEqual(['Money', 'Address', 'EmailAddress', 'PhoneNumber', 'AuditTrail']);
  });

  it('ships all three enums', () => {
    const names = ENUMS.map(e => e.name);
    expect(names).toEqual(['Status', 'Priority', 'AuditAction']);
  });

  it('every catalog entry has a non-empty source getter', () => {
    for (const entry of [...ARCHETYPES, ...VALUE_OBJECTS, ...ENUMS]) {
      const src = entry.get();
      expect(src.length, `${entry.name} source should not be empty`).toBeGreaterThan(0);
      // Every stdlib file declares a value, enum, or pattern reference
      expect(src, `${entry.name} source should declare a value, enum, or pattern`).toMatch(
        /(value|enum)\s+[A-Z]/
      );
    }
  });

  it('every catalog entry resolves to a path that ends with the declared sourcePath', () => {
    const normalize = (s: string) => s.replace(/\\/g, '/');
    for (const entry of [...ARCHETYPES, ...VALUE_OBJECTS, ...ENUMS]) {
      const p = normalize(manifestPath(entry.sourcePath));
      const target = normalize(entry.sourcePath);
      expect(p.endsWith(target), `path ${p} should end with ${target}`).toBe(true);
    }
  });
});

describe('@manifest/stdlib source files compile independently', () => {
  const cases: Array<{ name: string; src: () => string }> = [
    { name: 'Money', src: moneySource },
    { name: 'Address', src: addressSource },
    { name: 'EmailAddress', src: emailSource },
    { name: 'PhoneNumber', src: phoneSource },
    { name: 'AuditTrail', src: auditTrailSource },
    { name: 'Status', src: statusEnumSource },
    { name: 'Priority', src: priorityEnumSource },
    { name: 'AuditAction', src: auditActionEnumSource },
    { name: 'Timestamped archetype', src: timestampedArchetypeSource },
    { name: 'SoftDeletable archetype', src: softDeletableArchetypeSource },
    { name: 'Owned archetype', src: ownedArchetypeSource },
    { name: 'Auditable archetype', src: auditableArchetypeSource },
    { name: 'StateMachine archetype', src: stateMachineArchetypeSource },
  ];

  for (const { name, src } of cases) {
    it(`${name} compiles without errors`, async () => {
      const result = await compileToIR(src());
      const errors = result.diagnostics.filter(d => d.severity === 'error');
      expect(errors, `${name} produced errors: ${JSON.stringify(errors)}`).toEqual([]);
    });
  }
});

describe('@manifest/stdlib integrated usage', () => {
  it('a user file can compose stdlib value objects and enums into an entity', async () => {
    // Simulate what happens when a user `use`s the stdlib files: the
    // contents are inlined into the compiled program. We build that
    // inlined source and compile it directly.
    const inlined = [moneySource(), statusEnumSource(), `
entity Product {
  property required id: string
  property name: string
  property price: Money
  property status: Status = draft
  store Product in memory
}
`].join('\n');

    const result = await compileToIR(inlined);
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    expect(errors, `inline program errors: ${JSON.stringify(errors)}`).toEqual([]);

    expect(result.ir).not.toBeNull();
    const product = result.ir!.entities.find(e => e.name === 'Product');
    expect(product, 'Product entity should be present in compiled IR').toBeDefined();

    // The two value/enum declarations from the stdlib should be merged in.
    const valueNames = result.ir!.values.map(v => v.name);
    const enumNames = result.ir!.enums.map(e => e.name);
    const entityNames = result.ir!.entities.map(e => e.name);

    expect(valueNames).toContain('Money');
    expect(enumNames).toContain('Status');
    expect(entityNames).toContain('Product');
  });

  it('the Timestamped archetype source uses the built-in `timestamps` keyword', () => {
    const src = timestampedArchetypeSource();
    expect(src).toMatch(/timestamps/);
  });

  it('the StateMachine archetype references the `transition` keyword', () => {
    const src = stateMachineArchetypeSource();
    expect(src).toMatch(/transition\s+status\s+from/);
  });
});
