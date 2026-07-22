/**
 * Dedicated proof that computed `cache request|session|ttl` strategies
 * hit/miss and expire — not only that values compute correctly (fixture 65).
 */
import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

const SRC = `entity Product {
  property required price: number
  property quantity: number = 1
  property taxRate: number = 0

  computed subtotal: number = price * quantity cache request
  computed total: number = subtotal * (1 + taxRate / 100) cache session
  computed margin: number = subtotal * 0.3 cache ttl 1
  computed label: string = "Product"
}
store Product in memory`;

describe('computed property cache strategies', () => {
  async function engineWithClock(clock: { now: number }) {
    const { ir, diagnostics } = await compileToIR(SRC);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const engine = new RuntimeEngine(ir!, {}, { now: () => clock.now, generateId: () => 'p1' });
    await engine.createInstance('Product', { price: 10, quantity: 2, taxRate: 0 });
    return engine;
  }

  it('request cache: first eval misses, second hits', async () => {
    const engine = await engineWithClock({ now: 1_000 });
    const first = await engine.evaluateComputedWithMeta('Product', 'p1', 'subtotal');
    const second = await engine.evaluateComputedWithMeta('Product', 'p1', 'subtotal');
    expect(first).toEqual({ value: 20, stale: false, cached: false });
    expect(second).toEqual({ value: 20, stale: false, cached: true });
  });

  it('session cache: first eval misses, second hits', async () => {
    const engine = await engineWithClock({ now: 1_000 });
    const first = await engine.evaluateComputedWithMeta('Product', 'p1', 'total');
    const second = await engine.evaluateComputedWithMeta('Product', 'p1', 'total');
    expect(first?.cached).toBe(false);
    expect(second?.cached).toBe(true);
    expect(second?.value).toBe(20);
  });

  it('ttl cache: hits within window, misses after expiry', async () => {
    const clock = { now: 1_000_000 };
    const engine = await engineWithClock(clock);
    const first = await engine.evaluateComputedWithMeta('Product', 'p1', 'margin');
    expect(first).toEqual({ value: 6, stale: false, cached: false });

    clock.now = 1_000_500; // still inside 1s TTL
    const hit = await engine.evaluateComputedWithMeta('Product', 'p1', 'margin');
    expect(hit?.cached).toBe(true);

    clock.now = 1_001_001; // past 1s TTL
    const miss = await engine.evaluateComputedWithMeta('Product', 'p1', 'margin');
    expect(miss).toEqual({ value: 6, stale: false, cached: false });
  });

  it('uncached computed always reports cached: false', async () => {
    const engine = await engineWithClock({ now: 1_000 });
    const a = await engine.evaluateComputedWithMeta('Product', 'p1', 'label');
    const b = await engine.evaluateComputedWithMeta('Product', 'p1', 'label');
    expect(a).toEqual({ value: 'Product', stale: false, cached: false });
    expect(b).toEqual({ value: 'Product', stale: false, cached: false });
  });
});
