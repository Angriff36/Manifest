import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import * as convexServer from 'convex/server';
import * as convexValues from 'convex/values';
import { convexTest } from 'convex-test';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './index.js';

const boundaryField = `key${'x'.repeat(42)}`;
const overlongField = `${boundaryField}x`;
const indexes = [
  ['tenantId', 'personId', 'status', 'name', 'expiresAt'],
  ['tenantId', 'personId', 'status', 'name', 'expiredAt'],
];
const source = `
entity Qualification {
  property required tenantId: string
  property required personId: string
  property required status: string
  property required name: string
  property expiresAt: datetime?
  property expiredAt: datetime?
  property indexed ${boundaryField}: string
  property indexed ${overlongField}: string
}
store Qualification in durable
`;

function load(code: string): Record<string, any> {
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  expect(js.diagnostics).toEqual([]);
  const exports = {};
  new Function('require', 'exports', js.outputText)((name: string) => {
    if (name === 'convex/server') return convexServer;
    if (name === 'convex/values') return convexValues;
    if (name === './_generated/server') return { query: convexServer.queryGeneric };
    throw new Error(`Unexpected generated import: ${name}`);
  }, exports);
  return exports;
}

async function generate(softDelete = false, indexOrder = indexes) {
  const compiled = await compileToIR(
    softDelete
      ? source.replace(
          'entity Qualification {',
          'entity Qualification {\n  property deletedAt: datetime?',
        )
      : source,
  );
  expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
  const projection = new ConvexProjection();
  const options = { indexes: { Qualification: indexOrder } };
  const result = (surface: string) => {
    const output = projection.generate(compiled.ir!, { surface, options });
    expect(output.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    return output.artifacts[0].code;
  };
  const queryCode = result('convex.queries');
  const queries = load(queryCode);
  const queryByIndex = new Map(
    queryCode
      .split('export const ')
      .slice(1)
      .flatMap((block) => {
        const name = block.match(/^(\w+) = query/);
        const index = block.match(/withIndex\("([^"]+)"/);
        return name && index ? [[index[1], name[1]] as const] : [];
      }),
  );
  return { queries, queryCode, queryByIndex, schema: load(result('convex.schema')).default };
}

describe('Convex indexed query names', () => {
  it('preserves the existing name at 64 characters and bounds longer indexed exports', async () => {
    const { queries } = await generate();
    const boundaryName = `listQualificationByKey${'x'.repeat(42)}`;
    expect(boundaryName).toHaveLength(64);
    expect(queries).toHaveProperty(boundaryName);
    const names = Object.keys(queries);
    expect(names.every((name) => name.length <= 64)).toBe(true);
    expect(names.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))).toBe(true);
  });

  it('keeps distinct long indexes stable when index declaration order changes', async () => {
    const first = await generate();
    const reordered = await generate(false, [...indexes].reverse());
    const names = indexes.map((fields) => first.queryByIndex.get(`by_${fields.join('_')}`));
    expect(names.every((name) => typeof name === 'string' && name.length <= 64)).toBe(true);
    expect(new Set(names).size).toBe(2);
    for (const fields of indexes) {
      const index = `by_${fields.join('_')}`;
      expect(reordered.queryByIndex.get(index)).toBe(first.queryByIndex.get(index));
    }
  });

  it.each([false, true])(
    'executes each shortened composite read with soft-delete filtering %s',
    async (softDelete) => {
      const { queries, queryByIndex, schema } = await generate(softDelete);
      const root = convexTest(schema, {
        './_generated/server.ts': async () => ({ query: convexServer.queryGeneric }),
        './queries.ts': async () => queries,
      });
      const common = { tenantId: 'tenant', personId: 'crew', status: 'active', name: 'Service' };
      await root.run(async (ctx) => {
        await ctx.db.insert('qualifications', { ...common, expiresAt: 100, expiredAt: 200 });
        await ctx.db.insert('qualifications', { ...common, expiresAt: 300, expiredAt: 400 });
        if (softDelete)
          await ctx.db.insert('qualifications', {
            ...common,
            expiresAt: 100,
            expiredAt: 200,
            deletedAt: 1,
          });
      });
      for (const [fields, value] of [
        [indexes[0], 100],
        [indexes[1], 200],
      ] as const) {
        const name = queryByIndex.get(`by_${fields.join('_')}`)!;
        expect(name.length).toBeLessThanOrEqual(64);
        const rows = await root.query(
          convexServer.makeFunctionReference<'query'>(`queries:${name}`),
          {
            ...common,
            [fields[fields.length - 1]]: value,
          },
        );
        expect(rows).toMatchObject([{ expiresAt: 100, expiredAt: 200 }]);
        expect(rows).toHaveLength(1);
      }
    },
  );
});
