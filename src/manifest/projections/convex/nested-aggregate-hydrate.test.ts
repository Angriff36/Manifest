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

  it('hydrates hasMany→belongsTo under sum(filter(...)) and projects nested ceil', async () => {
    const program = `
entity Recipe {
  property yieldQuantity: decimal = 1
  property servesPerYield: int = 1
  hasMany ingredientLines: RecipeIngredient
  computed liveBatchCost: money = sum(filter(self.ingredientLines, (line) => line.deletedAt == null), (line) => line.quantity * line.ingredient.costPerUnit)
}
entity Ingredient {
  property costPerUnit: money = 0
}
entity RecipeIngredient {
  property recipeId: string
  property ingredientId: string
  property quantity: decimal = 0
  property deletedAt: datetime?
  belongsTo recipe: Recipe fields [recipeId] references [id]
  belongsTo ingredient: Ingredient fields [ingredientId] references [id]
}
entity Dish {
  hasMany recipeLines: DishRecipe
}
entity DishRecipe {
  property dishId: string
  property recipeId: string
  property attachedAt: datetime?
  property deletedAt: datetime?
  belongsTo dish: Dish fields [dishId] references [id]
  belongsTo recipe: Recipe fields [recipeId] references [id]
}
entity Event {
  property expectedHeadcount: int = 0
}
entity EventDish {
  property eventId: string
  property dishId: string
  property headcountOverride: int = 0
  belongsTo event: Event fields [eventId] references [id]
  belongsTo dish: Dish fields [dishId] references [id]
  computed targetHeadcount: int = self.headcountOverride > 0 ? self.headcountOverride : self.event.expectedHeadcount
  computed requiredBatches: int = max_of(filter(self.dish.recipeLines, (line) => line.deletedAt == null and line.attachedAt != null), (line) => line.recipe.servesPerYield > 0 ? ceil(self.targetHeadcount / line.recipe.servesPerYield) : 0)
}
store Recipe in durable
store Ingredient in durable
store RecipeIngredient in durable
store Dish in durable
store DishRecipe in durable
store Event in durable
store EventDish in durable
`;
    const { ir, diagnostics } = await compileToIR(program);
    expect((diagnostics ?? []).filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();

    const recipe = ir!.entities.find((e) => e.name === 'Recipe')!;
    const eventDish = ir!.entities.find((e) => e.name === 'EventDish')!;
    const options = normalizeOptions({});

    const recipeHydrate = planAndRenderAggregateHydration(
      ir!,
      recipe,
      recipe.computedProperties.map((cp) => cp.expression),
      options,
      'docId',
    ).lines.join('\n');
    expect(recipeHydrate).toContain('ingredientLines = await ctx.db.query');
    expect(recipeHydrate).toContain('.ingredient = __fk != null ? await ctx.db.get');

    const eventDishHydrate = planAndRenderAggregateHydration(
      ir!,
      eventDish,
      eventDish.computedProperties.map((cp) => cp.expression),
      options,
      'docId',
    ).lines.join('\n');
    expect(eventDishHydrate).toContain('.recipe = __fk != null ? await ctx.db.get');

    const computed = new ConvexProjection().generate(ir!, { surface: 'convex.computed' });
    const code = computed.artifacts[0]!.code;
    expect(computed.diagnostics.filter((d) => d.code === 'CONVEX_UNRESOLVED_COMPUTED')).toEqual([]);
    expect(code).toContain('requiredBatches');
    expect(code).toContain('Math.ceil');
    expect(code).toContain('liveBatchCost');

    const batchesCp = eventDish.computedProperties.find((cp) => cp.name === 'requiredBatches')!;
    const rendered = renderExpression(batchesCp.expression, { selfVar: 'doc' });
    expect(rendered.unresolved).toEqual([]);
  });
});
