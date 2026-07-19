/**
 * Convex application assembly verification — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRProperty, IRStore, IRCommand } from '../../ir';
import { ConvexProjection } from './generator.js';
import { ContractTestsProjection } from '../contract-tests/generator.js';
import { verifyConvexApplicationAssembly } from './assembly-verify.js';
import { generateConvexSeedScript } from '../../seed-pack/convex-binding.js';
import type { SeedPack } from '../../seed-pack/types.js';
import { clearProjections } from '../registry.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

describe('verifyConvexApplicationAssembly', () => {
  it('passes when required surfaces, companions, seed, and contract-tests are present', () => {
    clearProjections();
    const ir = emptyIR();
    const props: IRProperty[] = [
      { name: 'title', type: { name: 'string', nullable: false }, modifiers: ['required'] },
    ];
    const e: IREntity = {
      name: 'Task',
      properties: props,
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    };
    ir.entities = [e];
    ir.stores = [{ entity: 'Task', target: 'durable', config: {} } satisfies IRStore];
    ir.commands = [
      {
        entity: 'Task',
        name: 'create',
        parameters: [{ name: 'title', type: { name: 'string', nullable: false }, required: true }],
        guards: [],
        actions: [],
        emits: [],
      } satisfies IRCommand,
    ];

    const convex = new ConvexProjection();
    const surfaces = [
      'convex.schema',
      'convex.queries',
      'convex.mutations',
      'convex.crons',
      'convex.http',
      'convex.sagas',
      'convex.react',
    ] as const;
    const artifacts: { id: string; code: string }[] = surfaces.map((surface) => {
      const res = convex.generate(ir, { surface });
      return { id: surface, code: res.artifacts[0]?.code ?? '// empty' };
    });

    const ct = new ContractTestsProjection().generate(ir, {
      surface: 'contract-tests.convex',
    });
    artifacts.push({
      id: 'contract-tests.convex',
      code: ct.artifacts[0]!.code,
    });

    const pack: SeedPack = {
      meta: { packId: 'demo', version: '1', entities: ['Task'] },
      tables: [
        {
          entity: 'Task',
          columns: ['seedKey', 'title'],
          rows: [{ seedKey: 'a', title: 'x' }],
        },
      ],
    };
    const { binding, code: seedCode } = generateConvexSeedScript(ir, pack);
    artifacts.push({ id: 'scripts/seed-convex.ts', code: seedCode });

    const report = verifyConvexApplicationAssembly({
      artifacts,
      seedBinding: binding,
      ir,
    });
    expect(report.ok, JSON.stringify(report.checks, null, 2)).toBe(true);
  });
});
