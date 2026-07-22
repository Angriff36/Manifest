/**
 * Appendix E: string/array member `.length` ≡ length(v).
 */

import { describe, expect, it } from 'vitest';
import { RuntimeEngine } from './runtime-engine';
import type { IR, IRExpression } from './ir';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'member-length',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
  };
}

async function evalExpr(expr: IRExpression, context: Record<string, unknown>): Promise<unknown> {
  const runtime = new RuntimeEngine(emptyIR(), {}, {
    generateId: () => 'id',
    now: () => 0,
  });
  return runtime['evaluateExpression'](expr, context);
}

function lengthMember(object: IRExpression): IRExpression {
  return { kind: 'member', object, property: 'length' };
}

describe('member .length (Appendix E)', () => {
  it('returns string character count', async () => {
    const expr = lengthMember({ kind: 'identifier', name: 'title' });
    await expect(evalExpr(expr, { title: 'hello' })).resolves.toBe(5);
  });

  it('matches length() builtin for strings', async () => {
    const member = lengthMember({ kind: 'identifier', name: 'title' });
    const call: IRExpression = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'length' },
      args: [{ kind: 'identifier', name: 'title' }],
    };
    const ctx = { title: 'café' };
    await expect(evalExpr(member, ctx)).resolves.toBe(await evalExpr(call, ctx));
  });

  it('returns array element count', async () => {
    const expr = lengthMember({ kind: 'identifier', name: 'tags' });
    await expect(evalExpr(expr, { tags: ['a', 'b', 'c'] })).resolves.toBe(3);
  });

  it('returns undefined for non-string/non-array receivers', async () => {
    const expr = lengthMember({ kind: 'identifier', name: 'n' });
    await expect(evalExpr(expr, { n: 42 })).resolves.toBeUndefined();
  });
});
