import { describe, expect, it } from 'vitest';
import { IRCompiler } from '../../ir-compiler';
import { ConvexProjection } from './generator.js';

async function compile(source: string) {
  const result = await new IRCompiler().compileToIR(source);
  if (!result.ir) {
    throw new Error(`Compilation failed: ${result.diagnostics.map((d) => d.message).join(', ')}`);
  }
  result.ir.stores = [{ entity: 'Lead', target: 'durable', config: {} }];
  return result.ir;
}

function argsOf(code: string, exportName: string): string {
  const start = code.indexOf(`export const ${exportName} = mutation({`);
  expect(start).toBeGreaterThanOrEqual(0);
  const section = code.slice(start);
  return section.slice(section.indexOf('args: {'), section.indexOf('handler:'));
}

// Zod params already emit `.nullable()` for `T?`; Convex args must accept the
// same null or a value the shared schema passes is rejected by the mutation.
describe('Convex args for nullable command parameters', () => {
  const source = `
    entity Lead {
      property id: string
      property required name: string
      property phone: string?
      property note: string?

      command capture(name: string, optional phone: string?, optional note: string) {
        mutate name = name
        mutate phone = phone
        mutate note = note
      }

      command revise(phone: string?, optional note: string?) {
        mutate phone = phone
        mutate note = note
      }
    }
  `;

  it('accepts null for a nullable parameter on createVia and instance commands', async () => {
    const code = new ConvexProjection().generate(await compile(source), {
      surface: 'convex.mutations',
    }).artifacts[0]!.code;

    const create = argsOf(code, 'Lead_createViaCapture');
    expect(create).toContain('phone: v.optional(v.union(v.string(), v.null()))');
    // Optional but not nullable: omission only, null stays rejected.
    expect(create).toContain('note: v.optional(v.string())');

    const revise = argsOf(code, 'Lead_revise');
    expect(revise).toContain('phone: v.union(v.string(), v.null())');
    expect(revise).toContain('note: v.optional(v.union(v.string(), v.null()))');
  });
});
