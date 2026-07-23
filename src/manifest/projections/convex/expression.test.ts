/**
 * Convex expression renderer — unit tests.
 *
 * Covers the operator/builtin map and the fail-closed contract (unresolved
 * nodes are reported, never silently rendered as `true`).
 */

import { describe, it, expect } from 'vitest';
import type { IRExpression } from '../../ir';
import { renderExpression, type RenderScope } from './expression.js';

const DOC: RenderScope = { selfVar: 'doc' };

function lit(value: string | number | boolean | null): IRExpression {
  if (value === null) return { kind: 'literal', value: { kind: 'null' } };
  if (typeof value === 'string') return { kind: 'literal', value: { kind: 'string', value } };
  if (typeof value === 'number') return { kind: 'literal', value: { kind: 'number', value } };
  return { kind: 'literal', value: { kind: 'boolean', value } };
}
const id = (name: string): IRExpression => ({ kind: 'identifier', name });
const self = (property: string): IRExpression => ({ kind: 'member', object: id('self'), property });

describe('renderExpression — scopes & literals', () => {
  it('resolves self.x and bare identifiers to the self var', () => {
    expect(renderExpression(self('status'), DOC).code).toBe('doc.status');
    expect(renderExpression(id('status'), DOC).code).toBe('doc.status');
  });

  it('keeps bare identifiers as locals when bareIdentifierIsSelf is false', () => {
    expect(
      renderExpression(id('amount'), { selfVar: 'doc', bareIdentifierIsSelf: false }).code,
    ).toBe('amount');
  });

  it('renders plan-mapped self/this/bare relations as separate locals, including chaining', () => {
    const relationVars = { person: '__rel_person' };
    const chained: IRExpression = {
      kind: 'member',
      object: self('person'),
      property: 'status',
    };
    const viaThis: IRExpression = {
      kind: 'member',
      object: { kind: 'identifier', name: 'this' },
      property: 'person',
    };

    expect(renderExpression(self('person'), { ...DOC, relationVars }).code).toBe('__rel_person');
    expect(renderExpression(viaThis, { ...DOC, relationVars }).code).toBe('__rel_person');
    expect(renderExpression(id('person'), { ...DOC, relationVars }).code).toBe('__rel_person');
    expect(renderExpression(chained, { ...DOC, relationVars }).code).toBe('__rel_person.status');
  });

  it('does not replace a plan relation when a command local shadows its bare name', () => {
    expect(
      renderExpression(id('person'), {
        ...DOC,
        locals: ['person'],
        relationVars: { person: '__rel_person' },
      }).code,
    ).toBe('person');
  });

  it('renders literal 0 / false / "" exactly (not treated as missing)', () => {
    expect(renderExpression(lit(0), DOC).code).toBe('0');
    expect(renderExpression(lit(false), DOC).code).toBe('false');
    expect(renderExpression(lit(''), DOC).code).toBe('""');
  });

  it('resolves now/uuid builtins as identifiers', () => {
    expect(renderExpression(id('now'), DOC).code).toBe('Date.now()');
    expect(renderExpression(id('uuid'), DOC).code).toBe('crypto.randomUUID()');
  });
});

describe('renderExpression — operators', () => {
  const bin = (operator: string, left: IRExpression, right: IRExpression): IRExpression => ({
    kind: 'binary',
    operator,
    left,
    right,
  });

  it('maps == and != to === and !==', () => {
    expect(renderExpression(bin('==', self('status'), lit('draft')), DOC).code).toBe(
      '(doc.status === "draft")',
    );
    expect(renderExpression(bin('!=', self('status'), lit('draft')), DOC).code).toBe(
      '(doc.status !== "draft")',
    );
  });

  it('uses LOOSE equality for null comparisons (match null and absent/undefined)', () => {
    expect(renderExpression(bin('==', self('deletedAt'), lit(null)), DOC).code).toBe(
      '(doc.deletedAt == null)',
    );
    expect(renderExpression(bin('!=', self('deletedAt'), lit(null)), DOC).code).toBe(
      '(doc.deletedAt != null)',
    );
    expect(renderExpression(bin('==', lit(null), self('deletedAt')), DOC).code).toBe(
      '(null == doc.deletedAt)',
    );
  });

  it('maps and/or to &&/||', () => {
    expect(renderExpression(bin('and', lit(true), lit(false)), DOC).code).toBe('(true && false)');
    expect(renderExpression(bin('or', lit(true), lit(false)), DOC).code).toBe('(true || false)');
  });

  it('maps in to right.includes(left), and contains/notContains', () => {
    expect(
      renderExpression(
        bin('in', self('role'), { kind: 'array', elements: [lit('admin'), lit('mgr')] }),
        DOC,
      ).code,
    ).toBe('["admin", "mgr"].includes(doc.role)');
    expect(renderExpression(bin('contains', self('tags'), lit('x')), DOC).code).toBe(
      'doc.tags.includes("x")',
    );
    expect(renderExpression(bin('notContains', self('tags'), lit('x')), DOC).code).toBe(
      '!doc.tags.includes("x")',
    );
  });

  it('maps unary not to !', () => {
    expect(
      renderExpression({ kind: 'unary', operator: 'not', operand: self('active') }, DOC).code,
    ).toBe('(!doc.active)');
  });
});

describe('renderExpression — builtins', () => {
  const call = (name: string, ...args: IRExpression[]): IRExpression => ({
    kind: 'call',
    callee: id(name),
    args,
  });

  it('percent(a,b) and percent(a)', () => {
    expect(renderExpression(call('percent', self('a'), self('b')), DOC).code).toBe(
      '((doc.a) / (doc.b) * 100)',
    );
    expect(renderExpression(call('percent', self('a')), DOC).code).toBe('((doc.a) / 100)');
  });

  it('between(x,lo,hi)', () => {
    expect(renderExpression(call('between', self('x'), lit(1), lit(10)), DOC).code).toBe(
      '((doc.x) >= (1) && (doc.x) <= (10))',
    );
  });

  it('maps abs/round/floor/ceil to Math.* (runtime builtins)', () => {
    expect(renderExpression(call('abs', self('n')), DOC).code).toBe('Math.abs(doc.n)');
    expect(renderExpression(call('round', self('n')), DOC).code).toBe('Math.round(doc.n)');
    expect(renderExpression(call('floor', self('n')), DOC).code).toBe('Math.floor(doc.n)');
    expect(renderExpression(call('ceil', self('n')), DOC).code).toBe('Math.ceil(doc.n)');
    expect(renderExpression(call('ceil', self('n')), DOC).unresolved).toEqual([]);
  });

  it('roleAllows preserves its explicit role and optional target', () => {
    expect(
      renderExpression(
        call(
          'roleAllows',
          { kind: 'member', object: id('user'), property: 'role' },
          lit('manageAccess'),
        ),
        DOC,
      ).code,
    ).toBe('checkRole(user.role, "manageAccess")');
    expect(
      renderExpression(call('roleAllows', lit('Admin'), lit('read'), lit('Doc')), DOC).code,
    ).toBe('checkRole("Admin", "read", "Doc")');
  });
});

describe('renderExpression — global roots & locals', () => {
  it('renders user.role / context.x verbatim, not as doc members', () => {
    const userRole: IRExpression = { kind: 'member', object: id('user'), property: 'role' };
    expect(renderExpression(userRole, DOC).code).toBe('user.role');
    const ctx: IRExpression = { kind: 'member', object: id('context'), property: 'tenantId' };
    expect(renderExpression(ctx, DOC).code).toBe('context.tenantId');
  });

  it('renders declared locals (command params) verbatim', () => {
    const e: IRExpression = { kind: 'binary', operator: '>', left: id('amount'), right: lit(0) };
    expect(renderExpression(e, { selfVar: 'doc', locals: ['amount'] }).code).toBe('(amount > 0)');
    // without the local, a bare identifier is a self member
    expect(renderExpression(id('amount'), DOC).code).toBe('doc.amount');
  });
});

describe('renderExpression — fail closed', () => {
  it('reports unknown builtins instead of rendering true', () => {
    const res = renderExpression(
      { kind: 'call', callee: { kind: 'identifier', name: 'mysteryFn' }, args: [] },
      DOC,
    );
    expect(res.unresolved).toContain("builtin 'mysteryFn()'");
    expect(res.code).not.toBe('true');
  });

  it('reports unknown binary operators', () => {
    const res = renderExpression(
      { kind: 'binary', operator: '<=>', left: lit(1), right: lit(2) },
      DOC,
    );
    expect(res.unresolved).toContain("binary operator '<=>'");
  });

  it('resolves count_of with lambda predicate (Event.beginExecution shape)', () => {
    const pred: IRExpression = {
      kind: 'lambda',
      params: ['t'],
      body: {
        kind: 'binary',
        operator: 'and',
        left: {
          kind: 'binary',
          operator: '!=',
          left: { kind: 'member', object: id('t'), property: 'status' },
          right: lit('completed'),
        },
        right: {
          kind: 'binary',
          operator: '!=',
          left: { kind: 'member', object: id('t'), property: 'status' },
          right: lit('cancelled'),
        },
      },
    };
    const countCall: IRExpression = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'count_of' },
      args: [self('prepTasks'), pred],
    };
    const guard: IRExpression = {
      kind: 'binary',
      operator: '==',
      left: countCall,
      right: lit(0),
    };
    const res = renderExpression(guard, DOC);
    expect(res.unresolved).toEqual([]);
    expect(res.code).toBe(
      '(((doc.prepTasks) ?? []).filter((t: Record<string, any>) => (((t.status !== "completed") && (t.status !== "cancelled")))).length === 0)',
    );
  });

  it('types count_of lambdas with Doc<> when resolveCollectionElementType is set', () => {
    const pred: IRExpression = {
      kind: 'lambda',
      params: ['t'],
      body: {
        kind: 'binary',
        operator: '!=',
        left: { kind: 'member', object: id('t'), property: 'status' },
        right: lit('completed'),
      },
    };
    const countCall: IRExpression = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'count_of' },
      args: [self('prepTasks'), pred],
    };
    const res = renderExpression(countCall, {
      selfVar: 'doc',
      resolveCollectionElementType: (collection) =>
        collection.kind === 'member' && collection.property === 'prepTasks'
          ? 'Doc<"prepTasks">'
          : undefined,
    });
    expect(res.unresolved).toEqual([]);
    expect(res.code).toBe(
      '((doc.prepTasks) ?? []).filter((t: Doc<"prepTasks">) => ((t.status !== "completed"))).length',
    );
  });

  it('resolves bare lambdas as arrow functions; empty expressions stay unresolved', () => {
    const lam = renderExpression({ kind: 'lambda', params: ['x'], body: lit(1) }, DOC);
    expect(lam.unresolved).toEqual([]);
    expect(lam.code).toBe('(x: Record<string, any>) => (1)');
    expect(renderExpression(undefined, DOC).unresolved).toContain('empty expression');
  });

  it('fully resolves a typical guard with empty unresolved', () => {
    const res = renderExpression(
      { kind: 'binary', operator: '==', left: self('status'), right: lit('draft') },
      DOC,
    );
    expect(res.unresolved).toHaveLength(0);
  });

  it('resolves substring / indexOf / toUpperCase builtins', () => {
    const sub = renderExpression(
      {
        kind: 'call',
        callee: { kind: 'identifier', name: 'substring' },
        args: [self('code'), lit(0), lit(4)],
      },
      DOC,
    );
    expect(sub.unresolved).toEqual([]);
    expect(sub.code).toBe('(doc.code).substring(0, 4)');
  });

  it('maps self.id to idExpr and previousStatus to beforeVar.status', () => {
    const scope = { selfVar: '__after', idExpr: 'docId', beforeVar: 'doc' };
    expect(renderExpression(self('id'), scope).code).toBe('docId');
    expect(renderExpression(self('previousStatus'), scope).code).toBe('doc.status');
    expect(renderExpression(self('status'), scope).code).toBe('__after.status');
  });
});
