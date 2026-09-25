import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';

// `readonly` (docs/spec/semantics.md, Modifier enforcement) on Convex mutations.
const program = `
entity Invoice {
  property readonly invoiceNumber: string?
  property readonly batchCode: string?
  property note: string?

  command create(invoiceNumber: string, note: string) {
    mutate invoiceNumber = invoiceNumber
    mutate note = note
  }

  command renumber(invoiceNumber: string) {
    mutate invoiceNumber = invoiceNumber
  }

  command annotate(note: string) {
    mutate note = note
  }

  command stamp(batchCode: string) {
    mutate batchCode = batchCode
  }
}
store Invoice in durable
`;

async function generate() {
  const { ir, diagnostics } = await compileToIR(program);
  expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  const generated = new ConvexProjection().generate(ir!, {
    surface: 'convex.mutations',
    options: { policyMode: 'skip' },
  });
  expect(generated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  return generated.artifacts[0]!.code;
}

function load(code: string) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported: Record<string, { handler: (ctx: unknown, args: unknown) => Promise<unknown> }> =
    {};
  const runners: Record<
    string,
    (ctx: unknown, args: unknown, creation?: boolean) => Promise<unknown>
  > = {};
  const validator = new Proxy(() => validator, { get: () => validator });
  new Function(
    'exports',
    'require',
    'runners',
    `${javascript}\nrunners.stamp = __runInvoiceStamp;`,
  )(
    exported,
    (name: string) => {
      if (name === 'convex/values') return { v: validator, ConvexError: Error };
      if (name.endsWith('/server')) return { mutation: (value: unknown) => value };
      throw new Error(`Unexpected generated import: ${name}`);
    },
    runners,
  );
  return { exported, runners };
}

function database(initial: Record<string, unknown>) {
  const rows = new Map<string, Record<string, unknown>>([['inv', { _id: 'inv', ...initial }]]);
  const patches: unknown[] = [];
  const inserts: unknown[] = [];
  return {
    patches,
    inserts,
    ctx: {
      db: {
        get: async (id: string) => structuredClone(rows.get(id) ?? null),
        patch: async (_id: string, value: unknown) => {
          patches.push(value);
        },
        insert: async (_table: string, doc: unknown) => {
          inserts.push(doc);
          return 'new_inv';
        },
      },
    },
  };
}

describe('Convex readonly enforcement', () => {
  it('rejects a command that changes a readonly property', async () => {
    const { exported } = load(await generate());
    const db = database({ invoiceNumber: 'INV-1' });
    await expect(
      exported.Invoice_renumber!.handler(db.ctx, { docId: 'inv', invoiceNumber: 'INV-2' }),
    ).rejects.toThrow("E_READONLY: Property 'invoiceNumber' is readonly");
    expect(db.patches).toEqual([]);
  });

  it('rejects filling a readonly property on an existing row', async () => {
    const { exported } = load(await generate());
    const db = database({});
    await expect(
      exported.Invoice_stamp!.handler(db.ctx, { docId: 'inv', batchCode: 'B7' }),
    ).rejects.toThrow("E_READONLY: Property 'batchCode' is readonly");
  });

  it('allows writing the current value and changing other fields', async () => {
    const { exported } = load(await generate());
    const same = database({ invoiceNumber: 'INV-1' });
    await exported.Invoice_renumber!.handler(same.ctx, { docId: 'inv', invoiceNumber: 'INV-1' });
    expect(same.patches).toHaveLength(1);
    const other = database({ invoiceNumber: 'INV-1' });
    await exported.Invoice_annotate!.handler(other.ctx, { docId: 'inv', note: 'paid late' });
    expect(other.patches).toEqual([expect.objectContaining({ note: 'paid late' })]);
  });

  it('lets the creating command and an allocated row set it', async () => {
    const { exported, runners } = load(await generate());
    const create = database({});
    await exported.Invoice_create!.handler(create.ctx, { invoiceNumber: 'INV-9', note: '' });
    expect(create.inserts).toEqual([expect.objectContaining({ invoiceNumber: 'INV-9' })]);
    const allocated = database({});
    await runners.stamp!(allocated.ctx, { docId: 'inv', batchCode: 'B7' }, true);
    expect(allocated.patches).toEqual([expect.objectContaining({ batchCode: 'B7' })]);
  });

  it('lets commands stamp timestamps-managed updatedAt but not createdAt', async () => {
    const { ir } = await compileToIR(`
entity Note {
  timestamps
  property body: string?
  command edit(body: string) {
    mutate body = body
    mutate updatedAt = now()
  }
  command backdate(at: number) {
    mutate createdAt = at
  }
}
store Note in durable
`);
    const code = new ConvexProjection().generate(ir!, {
      surface: 'convex.mutations',
      options: { policyMode: 'skip' },
    }).artifacts[0]!.code;
    expect(code).not.toContain("Property 'updatedAt' is readonly");
    expect(code).toContain("E_READONLY: Property 'createdAt' is readonly");
  });
});
