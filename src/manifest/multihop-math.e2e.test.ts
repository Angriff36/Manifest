/**
 * End-to-end regression: multi-hop allergen union, headcount→demand rescale,
 * and shortageQuantity = max(0, required − stock).
 */
import { describe, expect, it } from 'vitest';
import { compileToIR } from './ir-compiler.js';
import { RuntimeEngine } from './runtime-engine.js';

const PROGRAM = `
enum AllergenCode { milk, eggs, wheat }

entity Dish {
  property name: string = ""
  hasMany recipeLines: DishRecipe
  computed allergenSummary: list<AllergenCode> = unique_of(flat_map(self.recipeLines, (line) => flat_map(line.recipe.ingredientLines, (ri) => ri.ingredient.allergens)))
}

entity DishRecipe {
  property dishId: string
  property recipeId: string
  belongsTo dish: Dish fields [dishId] references [id]
  belongsTo recipe: Recipe fields [recipeId] references [id]
}

entity Recipe {
  property name: string = ""
  hasMany ingredientLines: RecipeIngredient
}

entity RecipeIngredient {
  property recipeId: string
  property ingredientId: string
  belongsTo recipe: Recipe fields [recipeId] references [id]
  belongsTo ingredient: Ingredient fields [ingredientId] references [id]
}

entity Ingredient {
  property name: string = ""
  property allergens: list<AllergenCode> = []
  hasMany stockLines: InventoryItem
}

entity InventoryItem {
  property ingredientId: string
  property quantityOnHand: number = 0
  belongsTo ingredient: Ingredient fields [ingredientId] references [id]
}

entity Event {
  property expectedHeadcount: number = 1
  command changeHeadcount(newHeadcount: number) {
    compute previousHeadcount = self.expectedHeadcount
    mutate expectedHeadcount = newHeadcount
    emit EventHeadcountChanged {
      eventId: self.id
      previousHeadcount: previousHeadcount
      newHeadcount: newHeadcount
    }
  }
}

entity IngredientDemand {
  property eventId: string
  property ingredientId: string
  property requiredQuantity: number = 0
  property status: string = "calculated"
  belongsTo event: Event fields [eventId] references [id]
  belongsTo ingredient: Ingredient fields [ingredientId] references [id]
  computed shortageQuantity: number = self.requiredQuantity - sum(self.ingredient.stockLines, (s) => s.quantityOnHand) > 0 ? self.requiredQuantity - sum(self.ingredient.stockLines, (s) => s.quantityOnHand) : 0
  command recalculate(newQuantity: number, reason: string) {
    mutate requiredQuantity = newQuantity
    emit IngredientDemandRecalculated {
      ingredientDemandId: self.id
      requiredQuantity: newQuantity
      reason: reason
    }
  }
}

event EventHeadcountChanged: "event.headcount_changed" {
  eventId: string
  previousHeadcount: number
  newHeadcount: number
}
event IngredientDemandRecalculated: "ingredient_demand.recalculated" {
  ingredientDemandId: string
  requiredQuantity: number
  reason: string
}

on EventHeadcountChanged fanOut IngredientDemand where eventId = payload.eventId
  run recalculate
  params {
    newQuantity: self.requiredQuantity * (payload.newHeadcount / payload.previousHeadcount),
    reason: "headcount_changed"
  }

store Dish in memory
store DishRecipe in memory
store Recipe in memory
store RecipeIngredient in memory
store Ingredient in memory
store InventoryItem in memory
store Event in memory
store IngredientDemand in memory
`;

describe('multihop-math e2e', () => {
  it('derives allergenSummary, rescales demand on headcount change, computes shortageQuantity', async () => {
    const { ir, diagnostics } = await compileToIR(PROGRAM);
    const errors = (diagnostics ?? []).filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(ir).not.toBeNull();

    let n = 0;
    const engine = new RuntimeEngine(
      ir!,
      { user: { id: 'u1', role: 'admin' } },
      {
        now: () => 1_700_000_000_000,
        generateId: () => `id-${++n}`,
      },
    );

    await engine.createInstance('Ingredient', {
      id: 'ing-milk',
      name: 'Milk',
      allergens: ['milk'],
    });
    await engine.createInstance('Ingredient', {
      id: 'ing-flour',
      name: 'Flour',
      allergens: ['wheat'],
    });
    await engine.createInstance('Recipe', { id: 'recipe-1', name: 'Batter' });
    await engine.createInstance('RecipeIngredient', {
      id: 'ri-1',
      recipeId: 'recipe-1',
      ingredientId: 'ing-milk',
    });
    await engine.createInstance('RecipeIngredient', {
      id: 'ri-2',
      recipeId: 'recipe-1',
      ingredientId: 'ing-flour',
    });
    await engine.createInstance('Dish', { id: 'dish-1', name: 'Cake' });
    await engine.createInstance('DishRecipe', {
      id: 'dr-1',
      dishId: 'dish-1',
      recipeId: 'recipe-1',
    });

    const allergens = [
      ...(((await engine.evaluateComputed('Dish', 'dish-1', 'allergenSummary')) as string[]) ?? []),
    ].sort();
    expect(allergens).toEqual(['milk', 'wheat']);

    await engine.createInstance('Event', { id: 'event-1', expectedHeadcount: 10 });
    await engine.createInstance('IngredientDemand', {
      id: 'demand-1',
      eventId: 'event-1',
      ingredientId: 'ing-flour',
      requiredQuantity: 20,
      status: 'calculated',
    });
    await engine.createInstance('InventoryItem', {
      id: 'stock-1',
      ingredientId: 'ing-flour',
      quantityOnHand: 12,
    });

    const shortageBefore = await engine.evaluateComputed(
      'IngredientDemand',
      'demand-1',
      'shortageQuantity',
    );
    expect(shortageBefore).toBe(8);

    const rescale = await engine.runCommand(
      'changeHeadcount',
      { newHeadcount: 15 },
      { entityName: 'Event', instanceId: 'event-1' },
    );
    expect(rescale.success).toBe(true);

    const demandAfter = await engine.getInstance('IngredientDemand', 'demand-1');
    expect(demandAfter).toBeDefined();
    expect(Number((demandAfter as Record<string, unknown>).requiredQuantity)).toBe(30);

    const shortageAfter = await engine.evaluateComputed(
      'IngredientDemand',
      'demand-1',
      'shortageQuantity',
    );
    expect(shortageAfter).toBe(18);
  });
});
