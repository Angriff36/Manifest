import { describe, expect, it } from 'vitest';
import { IRCompiler } from '../../ir-compiler';
import { ConvexProjection } from './generator.js';

async function compile(source: string) {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  return result.ir;
}

describe('Convex draft defaults for command-owned fields', () => {
  it('seeds declared default status into __draft for guard-time pre-state and mutates the final doc', async () => {
    const ir = await compile(`
      entity IngredientDemand {
        property id: string
        property required status: string = "pending"
        property required quantity: number

        command calculate(quantity: number) {
          guard self.status == "pending"
          mutate quantity = quantity
          mutate status = "calculated"
        }
      }

      store IngredientDemand in memory
    `);

    ir.stores = [{ entity: 'IngredientDemand', target: 'durable', config: {} }];

    const calculate = ir.commands.find((command) => command.name === 'calculate')!;
    expect(calculate.initialization?.commandOwnedFields).toContain('status');
    expect(
      calculate.initialization?.initialLifecycleState.some((item) => item.property === 'status'),
    ).toBe(true);

    const code = new ConvexProjection().generate(ir, {
      surface: 'convex.mutations',
    }).artifacts[0]!.code;

    const start = code.indexOf('export const IngredientDemand_createViaCalculate');
    expect(start).toBeGreaterThanOrEqual(0);
    const createSection = code.slice(start);
    const draftSection = createSection.slice(
      createSection.indexOf('const __draft'),
      createSection.indexOf('const doc:'),
    );
    const docSection = createSection.slice(
      createSection.indexOf('const doc:'),
      createSection.indexOf('const docId = await ctx.db.insert'),
    );

    expect(draftSection).toContain('status: "pending"');
    expect(createSection).toContain('__draft.status === "pending"');
    expect(docSection).toContain('status: "calculated"');
    expect(docSection).toContain('...__draft');
  });
});
