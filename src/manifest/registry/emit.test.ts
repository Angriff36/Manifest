import { describe, it, expect } from 'vitest';
import { emitRegistries, UNOWNED_ENTITY_NAME } from './emit';
import { compileToIR } from '../ir-compiler';

async function ir(src: string) {
  const result = await compileToIR(src);
  if (!result.ir) {
    throw new Error(`Compile failed: ${result.diagnostics.map(d => d.message).join('; ')}`);
  }
  return result.ir;
}

describe('emitRegistries', () => {
  it('emits one commands entry per entity+command pair', async () => {
    const compiled = await ir(`
      entity Recipe {
        property tenantId: string
        property title: string
        command create() {
          emit RecipeCreated
        }
        command rename() {
          mutate title = "x"
        }
      }
      event RecipeCreated: "recipe.created" { recipeId: string }
    `);
    const { commands } = emitRegistries(compiled);
    const create = commands.commands.find(c => c.entity === 'Recipe' && c.command === 'create');
    expect(create).toBeDefined();
    expect(create!.commandId).toBe('Recipe.create');
    expect(create!.emits).toContain('RecipeCreated');

    const rename = commands.commands.find(c => c.entity === 'Recipe' && c.command === 'rename');
    expect(rename).toBeDefined();
    expect(rename!.effects).toContain('mutate');
  });

  it('classifies tenantId-bearing entities as governed', async () => {
    const compiled = await ir(`
      entity Recipe {
        property tenantId: string
        property title: string
      }
    `);
    const { entities } = emitRegistries(compiled);
    const recipe = entities.entities.find(e => e.name === 'Recipe');
    expect(recipe?.classification).toBe('governed');
    expect(recipe?.tenantScoped).toBe(true);
  });

  it('classifies non-tenant entities as unknown_nonconforming', async () => {
    const compiled = await ir(`
      entity SystemLog {
        property message: string
      }
    `);
    const { entities } = emitRegistries(compiled);
    const log = entities.entities.find(e => e.name === 'SystemLog');
    expect(log?.classification).toBe('unknown_nonconforming');
    expect(log?.tenantScoped).toBe(false);
  });

  it('shares irHash and compilerVersion between commands and entities registries', async () => {
    const compiled = await ir(`entity Foo { property name: string }`);
    const { commands, entities } = emitRegistries(compiled);
    expect(commands.irHash).toBe(entities.irHash);
    expect(commands.compilerVersion).toBe(entities.compilerVersion);
    expect(commands.irHash.length).toBeGreaterThan(0);
    expect(commands.compilerVersion.length).toBeGreaterThan(0);
  });

  it('lists properties in declaration order and excludes nothing', async () => {
    const compiled = await ir(`
      entity Order {
        property tenantId: string
        property total: number
        property status: string
      }
    `);
    const { entities } = emitRegistries(compiled);
    const order = entities.entities.find(e => e.name === 'Order');
    expect(order?.properties).toEqual(['tenantId', 'total', 'status']);
  });

  it('reports guardCount, effect kinds, and emits separately', async () => {
    // In the IR, `emit Foo` inside a command body is captured on
    // `IRCommand.emits: string[]`, not as an `IRAction` of kind 'emit'.
    // The registry mirrors this split: `effects` lists action kinds;
    // `emits` lists event names. Both are necessary.
    const compiled = await ir(`
      entity Recipe {
        property tenantId: string
        property title: string
        command publishIt() {
          guard tenantId != ""
          mutate title = "new"
          emit RecipePublished
        }
      }
      event RecipePublished: "recipe.published" { recipeId: string }
    `);
    const { commands } = emitRegistries(compiled);
    const cmd = commands.commands.find(c => c.command === 'publishIt');
    expect(cmd?.guardCount).toBe(1);
    expect(cmd?.effects).toContain('mutate');
    expect(cmd?.emits).toContain('RecipePublished');
  });

  it('inherits entity defaultPolicies into each command (deduped)', async () => {
    // Even without parser support for defaultPolicies, the emitter must
    // handle their presence on the IR — this guarantees forward-compat with
    // hand-constructed or future-parsed IR.
    const compiled = await ir(`entity Foo { property tenantId: string }`);
    // Inject defaultPolicies + a command with its own policy.
    const foo = compiled.entities.find(e => e.name === 'Foo')!;
    foo.defaultPolicies = ['tenantIsolation', 'auditEnabled'];
    compiled.commands.push({
      name: 'doThing',
      entity: 'Foo',
      parameters: [],
      guards: [],
      actions: [],
      emits: [],
      policies: ['auditEnabled', 'extraCheck'],
    });
    const { commands } = emitRegistries(compiled);
    const cmd = commands.commands.find(c => c.commandId === 'Foo.doThing');
    expect(cmd?.policies).toEqual(['tenantIsolation', 'auditEnabled', 'extraCheck']);
  });

  it('surfaces module-level commands under the unowned sentinel', async () => {
    const compiled = await ir(`entity Foo { property tenantId: string }`);
    compiled.commands.push({
      name: 'standalone',
      parameters: [],
      guards: [],
      actions: [],
      emits: [],
    });
    const { entities, commands } = emitRegistries(compiled);
    const unowned = entities.entities.find(e => e.name === UNOWNED_ENTITY_NAME);
    expect(unowned).toBeDefined();
    expect(unowned!.classification).toBe('infrastructure');
    expect(commands.commands.some(c => c.commandId === `${UNOWNED_ENTITY_NAME}.standalone`)).toBe(true);
  });

  it('handles empty IR without throwing', async () => {
    const compiled = await ir('');
    const { commands, entities } = emitRegistries(compiled);
    expect(commands.commands).toEqual([]);
    expect(entities.entities).toEqual([]);
  });
});
