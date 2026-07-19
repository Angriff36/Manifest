/**
 * Nested hasMany/belongsTo hydration for multi-hop aggregate computeds.
 * Proof shape: Root → Join → Mid → LeafLine → Leaf (unique_of ∘ flat_map chain).
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../ir-compiler.js';
import { planAndRenderAggregateHydration } from './aggregate-hydrate.js';
import { renderExpression } from './expression.js';
import { ConvexProjection } from './generator.js';
import { normalizeOptions } from './options.js';

const PROGRAM = `
enum TagCode { milk, eggs, wheat }

entity Root {
  property name: string = ""
  hasMany joins: Join
  computed tagSummary: list<TagCode> = unique_of(flat_map(self.joins, (join) => flat_map(join.mid.lines, (line) => line.leaf.tags)))
}

entity Join {
  property rootId: string
  property midId: string
  belongsTo root: Root fields [rootId] references [id]
  belongsTo mid: Mid fields [midId] references [id]
}

entity Mid {
  property name: string = ""
  hasMany lines: LeafLine
}

entity LeafLine {
  property midId: string
  property leafId: string
  belongsTo mid: Mid fields [midId] references [id]
  belongsTo leaf: Leaf fields [leafId] references [id]
}

entity Leaf {
  property name: string = ""
  property tags: list<TagCode> = []
}

store Root in durable
store Join in durable
store Mid in durable
store LeafLine in durable
store Leaf in durable
`;

describe('convex nested aggregate hydration', () => {
  it('hydrates every hop for unique_of(flat_map(...)) and evaluates safely', async () => {
    const { ir, diagnostics } = await compileToIR(PROGRAM);
    const errors = (diagnostics ?? []).filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(ir).not.toBeNull();

    const root = ir!.entities.find((e) => e.name === 'Root');
    expect(root).toBeTruthy();
    const options = normalizeOptions({});
    const planned = planAndRenderAggregateHydration(
      ir!,
      root!,
      root!.computedProperties.map((cp) => cp.expression),
      options,
      'docId',
    );

    const hydrate = planned.lines.join('\n');
    // Every relationship hop in Root → Join → Mid → LeafLine → Leaf
    expect(hydrate).toContain('(doc as any).joins = await ctx.db.query');
    expect(hydrate).toContain('by_rootId');
    expect(hydrate).toContain('.mid = __fk != null ? await ctx.db.get');
    expect(hydrate).toContain('.lines = await ctx.db.query');
    expect(hydrate).toContain('by_midId');
    expect(hydrate).toContain('.leaf = __fk != null ? await ctx.db.get');

    const computed = new ConvexProjection().generate(ir!, { surface: 'convex.computed' });
    const code = computed.artifacts[0]!.code;
    expect(code).toContain('hydrateComputedRelationsForRoot');
    expect(code).toContain('computeRoot');
    expect(code).toContain('tagSummary');
    expect(code).toContain('.flatMap(');
    expect(code).toContain('Array.from(new Set(');

    const expr = root!.computedProperties[0]!.expression;
    const rendered = renderExpression(expr, { selfVar: 'doc' });
    expect(rendered.unresolved).toEqual([]);
    // Lambda params may carry TypeScript annotations; strip before Function eval.
    const jsExpr = rendered.code
      .replace(/:\s*Doc<[^>]+>/g, '')
      .replace(/:\s*Record<string,\s*any>/g, '');
    expect(jsExpr, `rendered expression: ${rendered.code}`).not.toMatch(/:\s*(Doc|Record)/);
    const evaluate = new Function('doc', `return (${jsExpr});`) as (doc: unknown) => unknown;

    const hydrated = {
      joins: [
        {
          mid: {
            lines: [{ leaf: { tags: ['milk', 'eggs'] } }, { leaf: { tags: ['eggs', 'wheat'] } }],
          },
        },
        {
          mid: {
            lines: [{ leaf: { tags: ['milk'] } }],
          },
        },
      ],
    };
    expect(evaluate(hydrated)).toEqual(['milk', 'eggs', 'wheat']);

    expect(evaluate({ joins: [] })).toEqual([]);
    expect(
      evaluate({
        joins: [{ mid: { lines: [] } }],
      }),
    ).toEqual([]);
  });
});
