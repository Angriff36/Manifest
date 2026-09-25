import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compileToIR } from '../../ir-compiler.js';
import { ConvexProjection } from './generator.js';

// options.roleGateImport: an author gate consulted by roleAllows(user.role, …)
// before the role hierarchy (docs/spec/adapters.md, Convex role gate).
const program = `
tenant tenantId : string from context.tenantId
role staff {
  allow staffAccess
}
role sales extends staff {
  allow salesAccess
}
entity Quote {
  property tenantId: string
  property ownerRole: string = "sales"
  property status: string = "draft"
  default policy quoteRead read: roleAllows(user.role, "staffAccess") "Staff may read quotes"
  default policy quoteSend execute: roleAllows(user.role, "salesAccess") "Sales may send quotes"
  command send() {
    guard roleAllows(self.ownerRole, "salesAccess")
    mutate status = "sent"
  }
}
store Quote in durable
`;

async function generate(surface: 'convex.mutations' | 'convex.queries', gated: boolean) {
  const { ir, diagnostics } = await compileToIR(program);
  expect(diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  const generated = new ConvexProjection().generate(ir!, {
    surface,
    options: {
      authContextImport: './lib/auth',
      ...(gated ? { roleGateImport: './lib/roleGate' } : {}),
    },
  });
  expect(generated.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
  return generated.artifacts[0]!.code;
}

function load(code: string, auth: Record<string, unknown>, deniedActions: string[]) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exported: Record<string, { handler: (ctx: unknown, args: unknown) => Promise<unknown> }> =
    {};
  const validator = new Proxy(() => validator, { get: () => validator });
  const gateCalls: unknown[][] = [];
  new Function('exports', 'require', javascript)(exported, (name: string) => {
    if (name === 'convex/values') return { v: validator, ConvexError: Error };
    if (name.endsWith('/server')) return { mutation: (value: unknown) => value };
    if (name === './lib/auth') return { getAuthContext: async () => auth };
    if (name === './lib/roleGate') {
      return {
        roleGateDenies: (...args: unknown[]) => {
          gateCalls.push(args);
          return deniedActions.includes(args[1] as string);
        },
      };
    }
    throw new Error(`Unexpected generated import: ${name}`);
  });
  return { exported, gateCalls };
}

function database() {
  const rows = new Map<string, Record<string, unknown>>([
    ['q1', { _id: 'q1', tenantId: 't1', ownerRole: 'sales', status: 'draft' }],
  ]);
  const patches: unknown[] = [];
  return {
    patches,
    ctx: {
      db: {
        get: async (id: string) => structuredClone(rows.get(id) ?? null),
        patch: async (_id: string, value: unknown) => {
          patches.push(value);
        },
        insert: async () => 'event_row',
      },
    },
  };
}

describe('Convex roleGateImport', () => {
  const salesUser = { id: 'u1', role: 'sales', tenantId: 't1' };

  it('passes the acting user to the gate and denies what it denies', async () => {
    const code = await generate('convex.mutations', true);
    expect(code).toContain('import { roleGateDenies } from "./lib/roleGate";');
    expect(code).toContain('checkRole(user, "salesAccess")');
    // A stored role name is a plain hierarchy check, never gated.
    expect(code).toContain('checkRole(doc.ownerRole, "salesAccess")');

    const denied = load(code, salesUser, ['salesAccess']);
    const blocked = database();
    await expect(denied.exported.Quote_send!.handler(blocked.ctx, { docId: 'q1' })).rejects.toThrow(
      'Sales may send quotes',
    );
    expect(blocked.patches).toEqual([]);
    expect(denied.gateCalls).toContainEqual([salesUser, 'salesAccess', undefined]);

    const allowed = load(code, salesUser, []);
    const open = database();
    await allowed.exported.Quote_send!.handler(open.ctx, { docId: 'q1' });
    expect(open.patches).toEqual([expect.objectContaining({ status: 'sent' })]);
  });

  it('still enforces the role hierarchy when the gate allows', async () => {
    const code = await generate('convex.mutations', true);
    const staffOnly = load(code, { id: 'u2', role: 'staff', tenantId: 't1' }, []);
    const { ctx, patches } = database();
    await expect(staffOnly.exported.Quote_send!.handler(ctx, { docId: 'q1' })).rejects.toThrow(
      'Sales may send quotes',
    );
    expect(patches).toEqual([]);
  });

  it('gates generated reads the same way', async () => {
    const code = await generate('convex.queries', true);
    expect(code).toContain('import { roleGateDenies } from "./lib/roleGate";');
    expect(code).toContain('checkRole(user, "staffAccess")');
  });

  it('leaves output ungated without the option', async () => {
    const code = await generate('convex.mutations', false);
    expect(code).not.toContain('roleGateDenies');
    expect(code).toContain('checkRole(user.role, "salesAccess")');
  });
});
