/**
 * Domain completeness — compile-time product-wiring checks.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { checkDomainCompleteness } from './domain-completeness';
import type { IREntity, IRStore } from './ir';

async function runChecks(source: string) {
  return compileToIR(source);
}

describe('domain completeness — unwired FK (compile error)', () => {
  it('errors when child create requires parentId with no belongsTo', async () => {
    const { diagnostics } = await runChecks(`entity DisciplinaryAction {
  property required id: string
  command create(id: string) { mutate id = id }
}

entity ActionMilestone {
  property required id: string
  property title: string
  command create(disciplinaryActionId: string, title: string) {
    mutate id = disciplinaryActionId
    mutate title = title
  }
}

store DisciplinaryAction in memory
store ActionMilestone in memory`);

    const err = diagnostics.find(d => d.severity === 'error' && /no belongsTo/.test(d.message));
    expect(err).toBeDefined();
    expect(err!.message).toContain('ActionMilestone');
    expect(err!.message).toContain('DisciplinaryAction');
  });

  it('passes when child declares belongsTo, parent has hasMany, and reaction wires create', async () => {
    const { diagnostics, ir } = await runChecks(`entity DisciplinaryAction {
  property required id: string
  hasMany milestones: ActionMilestone
  command create(id: string) { mutate id = id }
  command close() { emit ActionClosed }
}

entity ActionMilestone {
  property required id: string
  property title: string
  belongsTo disciplinaryAction: DisciplinaryAction
  command create(disciplinaryActionId: string, title: string) {
    mutate id = disciplinaryActionId
    mutate disciplinaryActionId = disciplinaryActionId
    mutate title = title
  }
}

store DisciplinaryAction in memory
store ActionMilestone in memory

event ActionClosed: "action.closed" { actionId: string }

on ActionClosed run ActionMilestone.create
  resolve payload._subject.id
  params {
    disciplinaryActionId: payload._subject.id,
    title: "closed"
  }`);

    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(ir).not.toBeNull();
  });

  it('passes conformance-style Author/Book relationships', async () => {
    const { diagnostics } = await runChecks(`entity Author {
  property required name: string
  hasMany books: Book
}

entity Book {
  property required title: string
  belongsTo author: Author
}

store Author in memory
store Book in memory`);

    expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('warns (does not block) when create takes a manual parentId with no nested command or reaction', async () => {
    const { diagnostics, ir } = await runChecks(`entity DisciplinaryAction {
  property required id: string
  hasMany milestones: ActionMilestone
  command create(id: string) { mutate id = id }
}

entity ActionMilestone {
  property required id: string
  belongsTo disciplinaryAction: DisciplinaryAction
  command create(disciplinaryActionId: string, title: string) {
    mutate id = disciplinaryActionId
    mutate disciplinaryActionId = disciplinaryActionId
  }
}

store DisciplinaryAction in memory
store ActionMilestone in memory`);

    // Manual FK is valid (nudged via warning), so the program still compiles.
    const warn = diagnostics.find(d => d.severity === 'warning' && /manual 'disciplinaryActionId'/.test(d.message));
    expect(warn).toBeDefined();
    expect(diagnostics.some(d => d.severity === 'error' && /disciplinaryActionId/.test(d.message))).toBe(false);
    expect(ir).not.toBeNull();
  });
});

describe('domain completeness — parent context and auto fields', () => {
  it('errors when create requires tenantId but tenant is declared', async () => {
    const { diagnostics, ir } = await compileToIR(`tenant tenantId: string from context.tenantId

entity Item {
  property required id: string
  property required tenantId: string
  command create(tenantId: string, id: string) {
    mutate id = id
    mutate tenantId = tenantId
  }
}

store Item in memory`);

    expect(diagnostics.some(d => d.severity === 'error' && /requires 'tenantId'.*auto-provides/.test(d.message))).toBe(true);
    expect(ir).toBeNull();
  });

  it('errors when create requires userId or orgId from session context', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Membership {
  property required id: string
  property userId: string
  property orgId: string
  command create(userId: string, orgId: string, id: string) {
    mutate id = id
    mutate userId = userId
    mutate orgId = orgId
  }
}

store Membership in memory`);

    expect(diagnostics.some(d => d.severity === 'error' && /requires 'userId'.*auto-provides/.test(d.message))).toBe(true);
    expect(diagnostics.some(d => d.severity === 'error' && /requires 'orgId'.*auto-provides/.test(d.message))).toBe(true);
    expect(ir).toBeNull();
  });

  it('warns (does not block) when child create takes a parent-owned identifier field', async () => {
    const { diagnostics, ir } = await compileToIR(`entity Event {
  property required id: string
  property venueId: string = ""
  hasMany boards: BattleBoard
  command create(id: string, venueId: string) {
    mutate id = id
    mutate venueId = venueId
  }
}

entity BattleBoard {
  property required id: string
  property venueId: string = ""
  belongsTo event: Event
  command create(eventId: string, venueId: string, id: string) {
    mutate id = id
    mutate eventId = eventId
    mutate venueId = venueId
  }
}

store Event in memory
store BattleBoard in memory`);

    // Taking the parent's venueId directly is valid — nudged via warning, not blocked.
    expect(diagnostics.some(d => d.severity === 'warning' && /venueId.*owned by parent/.test(d.message))).toBe(true);
    expect(diagnostics.some(d => d.severity === 'error' && /owned by parent/.test(d.message))).toBe(false);
    expect(ir).not.toBeNull();
  });

  it('does NOT flag a generic value field that merely shares a name with the parent', async () => {
    // A contact's own firstName/email are coincidentally named like the client's;
    // they are not re-entered parent data, so they must not error. Only the FK
    // (clientId) would be parent-owned, and that is the relationship's own FK.
    const { diagnostics } = await compileToIR(`entity Client {
  property required id: string
  property firstName: string = ""
  property email: string = ""
  hasMany contacts: Contact
  command create(id: string, firstName: string, email: string) {
    mutate id = id
    mutate firstName = firstName
    mutate email = email
  }
}

entity Contact {
  property required id: string
  property required firstName: string
  property required email: string
  belongsTo client: Client
  command create(clientId: string, firstName: string, email: string, id: string) {
    mutate id = id
    mutate clientId = clientId
    mutate firstName = firstName
    mutate email = email
  }
}

store Client in memory
store Contact in memory`);

    expect(diagnostics.some(d => d.severity === 'error' && /owned by parent/.test(d.message))).toBe(false);
  });

  it('does NOT flag own fields as parent-owned for a self-referential relationship', async () => {
    // `belongsTo reverseOf: Txn` makes the entity its own relationship target.
    // Its own scalar create params (amount/reason) must not be reported as
    // "owned by parent Txn" — the entity is not its own parent.
    const { diagnostics } = await compileToIR(`entity Txn {
  property required id: string
  property required amount: number
  property required reason: string
  property reverseOfId: string = ""
  belongsTo reverseOf: Txn
  command create(id: string, amount: number, reason: string) {
    mutate id = id
    mutate amount = amount
    mutate reason = reason
  }
}

store Txn in memory`);

    expect(diagnostics.some(d => d.severity === 'error' && /owned by parent/.test(d.message))).toBe(false);
  });
});

describe('domain completeness — warnings', () => {
  it('errors on persisted orphan with domain FK wiring signals', () => {
    const entities: IREntity[] = [{
      name: 'Orphan',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'parentId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [{ name: 'parent', kind: 'belongsTo', target: 'Parent' }],
      commands: [],
      constraints: [],
      policies: [],
    }];
    const stores: IRStore[] = [{ entity: 'Orphan', target: 'memory', config: {} }];
    const diags: Array<{ severity: string; message: string }> = [];
    checkDomainCompleteness(entities, [], stores, (severity, message) => {
      diags.push({ severity, message });
    });
    expect(diags.some(d => d.severity === 'error' && /unreachable in the product/.test(d.message))).toBe(true);
  });

  it('warns on persisted property-only entity with no commands', () => {
    const entities: IREntity[] = [{
      name: 'Product',
      properties: [{ name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] }],
      computedProperties: [],
      relationships: [],
      commands: [],
      constraints: [],
      policies: [],
    }];
    const stores: IRStore[] = [{ entity: 'Product', target: 'memory', config: {} }];
    const diags: Array<{ severity: string; message: string }> = [];
    checkDomainCompleteness(entities, [], stores, (severity, message) => {
      diags.push({ severity, message });
    });
    expect(diags.some(d => d.severity === 'warning' && /unreachable in the product/.test(d.message))).toBe(true);
  });
});
