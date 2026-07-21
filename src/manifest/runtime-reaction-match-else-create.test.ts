import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * Reaction natural-key match with optional else create:
 *   on Event run Entity.cmd match f = e, … else create params {…}
 */
describe('reaction match else create', () => {
  const source = () => `
    entity Draft {
      property required id: string
      property required weekKey: string
      property required vendorId: string
      property required totalQty: number
      property status: string = "draft"
      // Initialization command: mutates required fields from params so else-create
      // allocates (see semantics.md § Initialization Commands).
      command ensure(weekKey: string, vendorId: string, totalQty: number) {
        mutate weekKey = weekKey
        mutate vendorId = vendorId
        mutate totalQty = totalQty
        mutate status = "draft"
        emit DraftEnsured { draftId: self.id, weekKey: weekKey, vendorId: vendorId, totalQty: totalQty }
      }
      store in memory
    }
    entity Need {
      property required id: string
      property weekKey: string = ""
      property vendorId: string = ""
      property quantity: number = 0
      command open(weekKey: string, vendorId: string, quantity: number) {
        mutate weekKey = weekKey
        mutate vendorId = vendorId
        mutate quantity = quantity
        emit NeedOpened { weekKey: weekKey, vendorId: vendorId, quantity: quantity }
      }
      store in memory
    }
    event NeedOpened: "need.opened" {
      weekKey: string
      vendorId: string
      quantity: number
    }
    event DraftEnsured: "draft.ensured" {
      draftId: string
      weekKey: string
      vendorId: string
      totalQty: number
    }
    on NeedOpened run Draft.ensure
      match weekKey = payload.weekKey, vendorId = payload.vendorId
      else create
      params {
        weekKey: payload.weekKey
        vendorId: payload.vendorId
        totalQty: payload.quantity
      }
  `;

  it('compiles match else create into IR match + elseCreate', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const reaction = ir!.reactions?.[0];
    expect(reaction?.resolve).toBeUndefined();
    expect(reaction?.elseCreate).toBe(true);
    expect(reaction?.match).toHaveLength(2);
    expect(reaction?.match?.[0]?.field).toBe('weekKey');
    expect(reaction?.match?.[1]?.field).toBe('vendorId');
  });

  it('fanOut + match else create upserts one target row per source key', async () => {
    const fanSource = `
      entity Order {
        property required id: string
        property status: string = "open"
        hasMany lines: Line
        command place() {
          mutate status = "placed"
          emit OrderPlaced { orderId: self.id }
        }
        store in memory
      }
      entity Line {
        property required id: string
        property orderId: string = ""
        property sku: string = ""
        property qty: number = 0
        belongsTo order: Order
        command set(orderId: string, sku: string, qty: number) {
          mutate orderId = orderId
          mutate sku = sku
          mutate qty = qty
        }
        store in memory
      }
      entity Pick {
        property required id: string
        property required orderId: string
        property required sku: string
        property required qty: number
        belongsTo order: Order
        command sync(orderId: string, sku: string, qty: number) {
          mutate orderId = orderId
          mutate sku = sku
          mutate qty = qty
        }
        store in memory
      }
      event OrderPlaced: "order.placed" { orderId: string }
      on OrderPlaced fanOut Line where orderId = payload.orderId
        run Pick.sync
        match orderId = payload.orderId, sku = self.sku
        else create
        params {
          orderId: payload.orderId
          sku: self.sku
          qty: self.qty
        }
    `;
    let seq = 0;
    const { ir, diagnostics } = await compileToIR(fanSource);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir!.reactions?.[0]?.fanOut).toBeTruthy();
    expect(ir!.reactions?.[0]?.elseCreate).toBe(true);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => `f-${++seq}` });
    await engine.createInstance('Order', { id: 'o1', status: 'open' } as EntityInstance);
    await engine.createInstance('Line', {
      id: 'l1',
      orderId: 'o1',
      sku: 'onion',
      qty: 3,
    } as EntityInstance);
    await engine.createInstance('Line', {
      id: 'l2',
      orderId: 'o1',
      sku: 'onion',
      qty: 5,
    } as EntityInstance);
    await engine.runCommand('place', {}, { entityName: 'Order', instanceId: 'o1' });
    const picks = (await engine.getAllInstances('Pick')) as EntityInstance[];
    // Two source lines share sku — match collapses to one Pick, last write wins qty.
    expect(picks).toHaveLength(1);
    expect(picks[0]?.sku).toBe('onion');
    expect(picks[0]?.qty).toBe(5);
  });

  it('creates on first open and updates the same draft on the second', async () => {
    let seq = 0;
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => `id-${++seq}` });

    await engine.createInstance('Need', {
      id: 'n1',
      weekKey: '',
      vendorId: '',
      quantity: 0,
    } as EntityInstance);
    await engine.createInstance('Need', {
      id: 'n2',
      weekKey: '',
      vendorId: '',
      quantity: 0,
    } as EntityInstance);

    await engine.runCommand(
      'open',
      { weekKey: '2026-W30', vendorId: 'v1', quantity: 10 },
      { entityName: 'Need', instanceId: 'n1' },
    );
    await engine.runCommand(
      'open',
      { weekKey: '2026-W30', vendorId: 'v1', quantity: 25 },
      { entityName: 'Need', instanceId: 'n2' },
    );

    const drafts = (await engine.getAllInstances('Draft')) as EntityInstance[];
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.weekKey).toBe('2026-W30');
    expect(drafts[0]?.vendorId).toBe('v1');
    expect(drafts[0]?.totalQty).toBe(25);
  });
});
