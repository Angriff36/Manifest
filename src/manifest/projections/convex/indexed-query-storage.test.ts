import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import * as convexServer from 'convex/server';
import * as convexValues from 'convex/values';
import { convexTest } from 'convex-test';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './index.js';

const SOURCE = `
enum WorkStatus { open closed }
entity CrewPerson {
  property required name: string
  hasMany work: IndexedWork
}
entity IndexedWork {
  property required label: string
  property indexed endsAt: datetime?
  property indexed quantity: decimal
  property indexed finished: boolean
  property indexed transport: int
  property indexed status: WorkStatus?
  property indexed encrypted confidentialAt: datetime?
  property ownerId: uuid?
  belongsTo owner: CrewPerson fields [ownerId] references [id]
}
store IndexedWork in durable
store CrewPerson in durable
`;

function load(source: string): Record<string, any> {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(javascript.diagnostics).toEqual([]);
  const exports = {};
  const requireGenerated = (name: string) => {
    if (name === 'convex/server') return convexServer;
    if (name === 'convex/values') return convexValues;
    if (name === './_generated/server') return { query: convexServer.queryGeneric };
    // The indexed value is its stored ciphertext, not decrypted plaintext.
    if (name === './encryption')
      return {
        decryptDoc: async (_ctx: unknown, _entity: unknown, _fields: unknown, row: unknown) => row,
      };
    throw new Error(`Unexpected generated import: ${name}`);
  };
  new Function('require', 'exports', javascript.outputText)(requireGenerated, exports);
  return exports;
}

async function fixture() {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  expect(compiled.ir).not.toBeNull();
  const projection = new ConvexProjection();
  const options = {
    typeMappings: { IndexedWork: { transport: 'v.int64()' } },
    encryptionImport: './encryption',
    indexes: { IndexedWork: [['finished', 'endsAt']] },
  };
  const generate = (surface: string) => {
    const result = projection.generate(compiled.ir!, { surface, options });
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    return result.artifacts[0]!.code;
  };
  const schema = load(generate('convex.schema')).default;
  const queries = load(generate('convex.queries'));
  const root = convexTest(schema, {
    './_generated/server.ts': async () => ({ query: convexServer.queryGeneric }),
    './queries.ts': async () => queries,
  });
  const call = (suffix: string, args: Record<string, unknown>) =>
    root.query(
      convexServer.makeFunctionReference<'query'>(`queries:listIndexedWorkBy${suffix}`),
      args,
    );
  const ownerId = await root.run(async (ctx) => {
    const ownerId = await ctx.db.insert('crewPersons', { name: 'Available coworker' });
    await ctx.db.insert('indexedWorks', {
      label: 'dated',
      endsAt: 1789080000000,
      quantity: 2.5,
      finished: false,
      transport: 42n,
      status: 'open',
      confidentialAt: 'ciphertext-envelope',
      ownerId,
    });
    await ctx.db.insert('indexedWorks', {
      label: 'null',
      endsAt: null,
      status: null,
      confidentialAt: null,
      ownerId: null,
    });
    await ctx.db.insert('indexedWorks', { label: 'missing' });
    return ownerId;
  });
  return { call, ownerId };
}

describe('Convex indexed query storage validators', () => {
  it('queries numeric timestamps and composite indexes using stored values', async () => {
    const { call } = await fixture();
    expect(await call('EndsAt', { endsAt: 1789080000000 })).toMatchObject([{ label: 'dated' }]);
    expect(
      await call('FinishedAndEndsAt', { finished: false, endsAt: 1789080000000 }),
    ).toMatchObject([{ label: 'dated' }]);
    await expect(call('EndsAt', { endsAt: '1789080000000' })).rejects.toThrow();
  });

  it('keeps missing fields distinct from explicit null when querying optional values', async () => {
    const { call } = await fixture();
    expect(await call('EndsAt', {})).toMatchObject([{ label: 'missing' }]);
    expect(await call('EndsAt', { endsAt: null })).toMatchObject([{ label: 'null' }]);
    expect(await call('Status', { status: null })).toMatchObject([{ label: 'null' }]);
    await expect(call('Status', { status: 'invented' })).rejects.toThrow();
  });

  it('accepts decimal and boolean storage values and explicit bigint overrides', async () => {
    const { call } = await fixture();
    expect(await call('Quantity', { quantity: 2.5 })).toMatchObject([{ label: 'dated' }]);
    expect(await call('Finished', { finished: false })).toMatchObject([{ label: 'dated' }]);
    expect(await call('Transport', { transport: 42n })).toMatchObject([{ label: 'dated' }]);
    await expect(call('Transport', { transport: 42 })).rejects.toThrow();
  });

  it('uses ciphertext storage for an encrypted timestamp index', async () => {
    const { call } = await fixture();
    expect(await call('ConfidentialAt', { confidentialAt: 'ciphertext-envelope' })).toMatchObject([
      { label: 'dated' },
    ]);
    expect(await call('ConfidentialAt', { confidentialAt: null })).toMatchObject([
      { label: 'null' },
    ]);
    await expect(call('ConfidentialAt', { confidentialAt: 1789080000000 })).rejects.toThrow();
  });

  it('preserves typed references and declared missing/null values', async () => {
    const { call, ownerId } = await fixture();
    expect(await call('OwnerId', { ownerId })).toMatchObject([{ label: 'dated' }]);
    expect(await call('OwnerId', { ownerId: null })).toMatchObject([{ label: 'null' }]);
    expect(await call('OwnerId', {})).toMatchObject([{ label: 'missing' }]);
    await expect(call('OwnerId', { ownerId: 'untyped-reference' })).rejects.toThrow();
  });
});
