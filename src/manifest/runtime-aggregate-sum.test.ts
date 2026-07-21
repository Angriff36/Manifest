import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, type EntityInstance } from './runtime-engine';

/**
 * Aggregate sum: `sum(Entity where field == value, ..., of quantityField)`.
 * Declarative recompute of parent totals from child contribution rows.
 */
describe('aggregate sum reactions', () => {
  const source = () => `
    entity Bucket {
      property required id: string
      property totalQty: number = 0
      command syncTotal(totalQty: number) { mutate totalQty = totalQty }
      store in memory
    }
    entity Contribution {
      property required id: string
      property bucketId: string = ""
      property quantity: number = 0
      property status: string = "open"
      belongsTo bucket: Bucket
      command record(bucketId: string, quantity: number) {
        mutate bucketId = bucketId
        mutate quantity = quantity
        mutate status = "open"
        emit ContributionRecorded { bucketId: self.bucketId }
      }
      store in memory
    }
    event ContributionRecorded: "contribution.recorded" {}
    on ContributionRecorded run Bucket.syncTotal
      resolve self.bucketId
      params {
        totalQty: sum(Contribution where bucketId == self.bucketId, status == "open", of quantity)
      }
  `;

  it('compiles sum(Entity where … of field) into an IR aggregate sum node', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(ir!.reactions?.[0]?.params?.[0]?.expression).toEqual({
      kind: 'aggregate',
      op: 'sum',
      entity: 'Contribution',
      field: 'quantity',
      predicates: [
        {
          field: 'bucketId',
          value: {
            kind: 'member',
            object: { kind: 'identifier', name: 'self' },
            property: 'bucketId',
          },
        },
        {
          field: 'status',
          value: { kind: 'literal', value: { kind: 'string', value: 'open' } },
        },
      ],
    });
  });

  it('sums matching child quantities onto the parent after each contribution', async () => {
    const { ir, diagnostics } = await compileToIR(source());
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => 1000, generateId: () => 'gen-id' });
    await engine.createInstance('Bucket', { id: 'b1', totalQty: 0 } as EntityInstance);
    await engine.createInstance('Contribution', {
      id: 'c1',
      bucketId: '',
      quantity: 0,
      status: 'open',
    } as EntityInstance);
    await engine.createInstance('Contribution', {
      id: 'c2',
      bucketId: '',
      quantity: 0,
      status: 'open',
    } as EntityInstance);

    await engine.runCommand(
      'record',
      { bucketId: 'b1', quantity: 10 },
      { entityName: 'Contribution', instanceId: 'c1' },
    );
    await engine.runCommand(
      'record',
      { bucketId: 'b1', quantity: 7.5 },
      { entityName: 'Contribution', instanceId: 'c2' },
    );

    const bucket = (await engine.getAllInstances('Bucket')) as EntityInstance[];
    expect(bucket.find((b) => b.id === 'b1')?.totalQty).toBe(17.5);
  });
});
