/**
 * Parent aggregates over child computed properties must hydrate the child's
 * relation graph and materialize those computeds onto each hasMany element
 * before the parent sum/map runs (Event.estimatedFoodCost ← EventDish.estimatedCost).
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from '../../ir-compiler.js';
import { planAndRenderAggregateHydration } from './aggregate-hydrate.js';
import { ConvexProjection } from './generator.js';
import { normalizeOptions } from './options.js';

const PROGRAM = `
entity Event {
  property expectedHeadcount: int = 0
  hasMany eventDishes: EventDish
  computed estimatedFoodCost: money = sum(filter(self.eventDishes, (item) => item.deletedAt == null and item.addedAt != null), (item) => item.estimatedCost)
}
entity Dish {
  hasMany recipeLines: DishRecipe
}
entity Recipe {
  property servesPerYield: int = 1
  hasMany ingredientLines: RecipeIngredient
}
entity Ingredient {
  property unit: string = "each"
  property costPerUnit: money = 0
}
entity RecipeIngredient {
  property recipeId: string
  property ingredientId: string
  property quantity: decimal = 0
  property unit: string = "each"
  property wasteFactor: decimal = 1
  property deletedAt: datetime?
  property addedAt: datetime?
  belongsTo recipe: Recipe fields [recipeId] references [id]
  belongsTo ingredient: Ingredient fields [ingredientId] references [id]
}
entity DishRecipe {
  property dishId: string
  property recipeId: string
  property attachedAt: datetime?
  property deletedAt: datetime?
  belongsTo dish: Dish fields [dishId] references [id]
  belongsTo recipe: Recipe fields [recipeId] references [id]
}
entity EventDish {
  property eventId: string
  property dishId: string
  property headcountOverride: int = 0
  property deletedAt: datetime?
  property addedAt: datetime?
  belongsTo event: Event fields [eventId] references [id]
  belongsTo dish: Dish fields [dishId] references [id]
  computed targetHeadcount: int = self.headcountOverride > 0 ? self.headcountOverride : self.event.expectedHeadcount
  computed estimatedCost: money = sum(filter(self.dish.recipeLines, (line) => line.deletedAt == null and line.attachedAt != null), (line) => (line.recipe.servesPerYield > 0 ? ceil(self.targetHeadcount / line.recipe.servesPerYield) : 0) * sum(filter(line.recipe.ingredientLines, (il) => il.deletedAt == null and il.addedAt != null), (il) => il.unit == il.ingredient.unit ? il.quantity * il.wasteFactor * il.ingredient.costPerUnit : 0))
}
store Event in durable
store Dish in durable
store Recipe in durable
store Ingredient in durable
store RecipeIngredient in durable
store DishRecipe in durable
store EventDish in durable
`;

describe('convex parent aggregate over child computeds', () => {
  it('hydrates EventDish graph and materializes estimatedCost under Event.eventDishes', async () => {
    const { ir, diagnostics } = await compileToIR(PROGRAM);
    expect((diagnostics ?? []).filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();

    const event = ir!.entities.find((e) => e.name === 'Event')!;
    const options = normalizeOptions({});
    const planned = planAndRenderAggregateHydration(
      ir!,
      event,
      event.computedProperties.map((cp) => cp.expression),
      options,
      'docId',
    );
    const hydrate = planned.lines.join('\n');

    expect(hydrate).toContain('eventDishes = await ctx.db.query');
    expect(hydrate).toContain('.dish = __fk != null ? await ctx.db.get');
    expect(hydrate).toContain('recipeLines = await ctx.db.query');
    expect(hydrate).toContain('.recipe = __fk != null ? await ctx.db.get');
    expect(hydrate).toContain('ingredientLines = await ctx.db.query');
    expect(hydrate).toContain('.ingredient = __fk != null ? await ctx.db.get');
    expect(hydrate).toMatch(/__agg\d+\.targetHeadcount\s*=/);
    expect(hydrate).toMatch(/__agg\d+\.estimatedCost\s*=/);
    // Materialize after nested relation loads (assign appears after ingredient hydrate).
    const ingredientAt = hydrate.indexOf('.ingredient = __fk != null ? await ctx.db.get');
    const costAt = hydrate.search(/__agg\d+\.estimatedCost\s*=/);
    expect(ingredientAt).toBeGreaterThanOrEqual(0);
    expect(costAt).toBeGreaterThan(ingredientAt);

    const queries = new ConvexProjection().generate(ir!, {
      surface: 'convex.queries',
      options: { computedProperties: 'inline' },
    });
    const code = queries.artifacts.map((a) => a.code).join('\n');
    expect(code).toContain('estimatedFoodCost');
    expect(code).toMatch(/\.estimatedCost\s*=/);
    expect(code).toContain('item.estimatedCost');
  });
});
