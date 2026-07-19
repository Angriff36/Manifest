/**
 * Runtime enforcement of IREntity.alternateKeys (multi-column uniqueness).
 */

import { describe, it, expect } from 'vitest';
import { IRCompiler } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

async function compile(source: string) {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(source);
  if (!result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join('; '));
  }
  return result.ir;
}

const source = `
entity Item {
  property required id: string
  property required orgId: string
  property required sku: string
  unique [orgId, sku]
  command touch() {
    mutate sku = self.sku
  }
}
store Item in memory
`;

describe('alternateKeys runtime enforcement', () => {
  it('rejects create that collides on an alternate key group', async () => {
    const ir = await compile(source);
    expect(ir.entities[0].alternateKeys).toEqual([['orgId', 'sku']]);
    const rt = new RuntimeEngine(ir, {});
    const a = await rt.createInstance('Item', { id: 'i1', orgId: 'o1', sku: 's1' });
    expect(a).toBeTruthy();
    const b = await rt.createInstance('Item', { id: 'i2', orgId: 'o1', sku: 's1' });
    expect(b).toBeUndefined();
  });

  it('allows same sku under a different orgId', async () => {
    const ir = await compile(source);
    const rt = new RuntimeEngine(ir, {});
    expect(await rt.createInstance('Item', { id: 'a', orgId: 'o1', sku: 'same' })).toBeTruthy();
    expect(await rt.createInstance('Item', { id: 'b', orgId: 'o2', sku: 'same' })).toBeTruthy();
  });

  it('rejects update that collides on an alternate key group', async () => {
    const ir = await compile(source);
    const rt = new RuntimeEngine(ir, {});
    await rt.createInstance('Item', { id: 'a', orgId: 'o1', sku: 'e1' });
    await rt.createInstance('Item', { id: 'b', orgId: 'o1', sku: 'e2' });
    const updated = await rt.updateInstance('Item', 'b', { sku: 'e1' });
    expect(updated).toBeUndefined();
  });
});
