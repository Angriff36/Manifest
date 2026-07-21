import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * Fan-out reactions: `on Event fanOut Target where field = self.x run cmd`.
 *
 * Before this feature a reaction resolved exactly ONE target, so a 1:N cascade
 * (cancel every child, release every reservation, …) could not be declared and
 * had to be hand-written as after-emit middleware. The fan-out form queries the
 * target collection by the match field and dispatches the command on every match.
 */
describe('fan-out reactions', () => {
  const source = () => `
    entity Parent {
      property required id: string
      property status: string = "active"
      hasMany children: Child

      command deactivate() {
        mutate status = "inactive"
        emit ParentDeactivated {}
      }

      store in memory
    }

    entity Child {
      property required id: string
      property parentId: string = ""
      property status: string = "active"
      belongsTo parent: Parent

      command deactivate() {
        mutate status = "inactive"
      }

      store in memory
    }

    event ParentDeactivated: "parent.deactivated" {}

    on ParentDeactivated fanOut Child where parentId = self.id
      run deactivate
  `;

  it('compiles a fanOut reaction into IR (parser + compiler)', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir!.reactions).toHaveLength(1);
    expect(ir!.reactions?.[0]?.fanOut).toEqual({
      matchField: 'parentId',
      matchSource: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'id' },
    });
    expect(ir!.reactions?.[0]?.resolve).toBeUndefined();
    expect(ir!.reactions?.[0]?.targetCommand).toBe('deactivate');
  });

  it('dispatches the command on every matching child (and only those)', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });

    await engine.createInstance('Parent', { id: 'p1', status: 'active' } as EntityInstance);
    // three children of p1, one child of p2 (must NOT be touched), one orphan.
    await engine.createInstance('Child', {
      id: 'c1',
      parentId: 'p1',
      status: 'active',
    } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'c2',
      parentId: 'p1',
      status: 'active',
    } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'c3',
      parentId: 'p1',
      status: 'active',
    } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'c4',
      parentId: 'p2',
      status: 'active',
    } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'c5',
      parentId: '',
      status: 'active',
    } as EntityInstance);

    const result = await engine.runCommand(
      'deactivate',
      {},
      { entityName: 'Parent', instanceId: 'p1' },
    );
    expect(result.success).toBe(true);

    const children = (await engine.getAllInstances('Child')) as EntityInstance[];
    const statusOf = (id: string): unknown => children.find((c) => c.id === id)?.status;
    // every p1 child deactivated (fan-out); p2 child and orphan untouched
    expect(statusOf('c1')).toBe('inactive');
    expect(statusOf('c2')).toBe('inactive');
    expect(statusOf('c3')).toBe('inactive');
    expect(statusOf('c4')).toBe('active');
    expect(statusOf('c5')).toBe('active');
  });

  it('skips soft-deleted fanOut source rows so cascades do not abort', async () => {
    const source = `
      entity Parent {
        property required id: string
        property status: string = "active"
        hasMany children: Child
        command deactivate() {
          mutate status = "inactive"
          emit ParentDeactivated {}
        }
        store in memory
      }
      entity Child {
        property required id: string
        property parentId: string = ""
        property status: string = "active"
        property deletedAt: datetime?
        belongsTo parent: Parent
        command deactivate() {
          guard self.deletedAt == null
          mutate status = "inactive"
        }
        store in memory
      }
      event ParentDeactivated: "parent.deactivated" {}
      on ParentDeactivated fanOut Child where parentId = self.id
        run deactivate
    `;
    const { ir, diagnostics } = await compileToIR(source);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });
    await engine.createInstance('Parent', { id: 'p1', status: 'active' } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'live',
      parentId: 'p1',
      status: 'active',
    } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'gone',
      parentId: 'p1',
      status: 'active',
      deletedAt: 500,
    } as EntityInstance);

    const result = await engine.runCommand(
      'deactivate',
      {},
      { entityName: 'Parent', instanceId: 'p1' },
    );
    expect(result.success).toBe(true);
    const children = (await engine.getAllInstances('Child')) as EntityInstance[];
    expect(children.find((c) => c.id === 'live')?.status).toBe('inactive');
    expect(children.find((c) => c.id === 'gone')?.status).toBe('active');
  });

  it('runs the target command with its own params on each match', async () => {
    const sourceWithReason = `
      entity Parent {
        property required id: string
        hasMany children: Child
        command deactivate() { mutate status = "inactive" emit ParentDeactivated {} }
        store in memory
      }
      entity Child {
        property required id: string
        property parentId: string = ""
        property reason: string = ""
        belongsTo parent: Parent
        command deactivate(reason: string) { mutate reason = reason }
        store in memory
      }
      event ParentDeactivated: "parent.deactivated" {}
      on ParentDeactivated fanOut Child where parentId = self.id
        run deactivate
        params { reason: "parent deactivated" }
    `;
    const { ir, diagnostics } = await compileToIR(sourceWithReason);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });
    await engine.createInstance('Parent', { id: 'p1', status: 'active' } as EntityInstance);
    await engine.createInstance('Child', {
      id: 'c1',
      parentId: 'p1',
      reason: '',
    } as EntityInstance);

    const result = await engine.runCommand(
      'deactivate',
      {},
      { entityName: 'Parent', instanceId: 'p1' },
    );
    expect(result.success).toBe(true);
    const children = (await engine.getAllInstances('Child')) as EntityInstance[];
    expect(children.find((c) => c.id === 'c1')?.reason).toBe('parent deactivated');
  });

  it('foreach-create: fanOut MatchEntity run Target.create allocates one target per match', async () => {
    const source = `
      entity Order {
        property required id: string
        property status: string = "pending"
        hasMany items: LineItem
        command place() {
          mutate status = "placed"
          emit OrderPlaced { orderId: self.id }
        }
        store in memory
      }
      entity LineItem {
        property required id: string
        property orderId: string = ""
        property quantity: number = 0
        belongsTo order: Order fields [orderId] references [id]
        store in memory
      }
      entity Shipment {
        property required id: string
        property lineItemId: string = ""
        property quantity: number = 0
        property status: string = "pending"
        belongsTo lineItem: LineItem fields [lineItemId] references [id]
        command create(lineItemId: string, quantity: number) {
          mutate lineItemId = lineItemId
          mutate quantity = quantity
          mutate status = "pending"
        }
        store in memory
      }
      event OrderPlaced: "order.placed" { orderId: string }
      on OrderPlaced fanOut LineItem where orderId = payload.orderId
        run Shipment.create
        params {
          lineItemId: self.id
          quantity: self.quantity
        }
    `;
    const { ir, diagnostics } = await compileToIR(source);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir!.reactions?.[0]).toMatchObject({
      targetEntity: 'Shipment',
      targetCommand: 'create',
      fanOut: { matchField: 'orderId', matchEntity: 'LineItem' },
    });

    let n = 0;
    const engine = new RuntimeEngine(
      ir!,
      {},
      {
        now: () => 1000,
        generateId: () => `gen-${++n}`,
      },
    );
    await engine.createInstance('Order', { id: 'o1', status: 'pending' } as EntityInstance);
    await engine.createInstance('LineItem', {
      id: 'li1',
      orderId: 'o1',
      quantity: 2,
    } as EntityInstance);
    await engine.createInstance('LineItem', {
      id: 'li2',
      orderId: 'o1',
      quantity: 5,
    } as EntityInstance);
    await engine.createInstance('LineItem', {
      id: 'liOther',
      orderId: 'o2',
      quantity: 9,
    } as EntityInstance);

    const result = await engine.runCommand('place', {}, { entityName: 'Order', instanceId: 'o1' });
    expect(result.success).toBe(true);

    const shipments = (await engine.getAllInstances('Shipment')) as EntityInstance[];
    expect(shipments).toHaveLength(2);
    expect(shipments.map((s) => s.lineItemId).sort()).toEqual(['li1', 'li2']);
    expect(shipments.find((s) => s.lineItemId === 'li1')?.quantity).toBe(2);
    expect(shipments.find((s) => s.lineItemId === 'li2')?.quantity).toBe(5);
  });
});
