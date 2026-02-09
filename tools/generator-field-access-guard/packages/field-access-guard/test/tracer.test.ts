import { describe, it, expect } from 'vitest';
import { createTracedProxy } from '../src/tracer.js';

describe('createTracedProxy', () => {
  it('records top-level property access', () => {
    const { proxy, getResult } = createTracedProxy({ name: 'Alice', age: 30 });

    void proxy.name;
    void proxy.age;

    const result = getResult();
    expect(result.observedPaths).toContain('name');
    expect(result.observedPaths).toContain('age');
  });

  it('records nested property access', () => {
    const { proxy, getResult } = createTracedProxy({
      user: { profile: { email: 'a@b.com' } },
    });

    void (proxy as any).user.profile.email;

    const result = getResult();
    expect(result.observedPaths).toContain('user');
    expect(result.observedPaths).toContain('user.profile');
    expect(result.observedPaths).toContain('user.profile.email');
  });

  it('records array element access with indices', () => {
    const { proxy, getResult } = createTracedProxy({
      items: [{ id: 1 }, { id: 2 }],
    });

    void (proxy as any).items[0].id;
    void (proxy as any).items[1].id;

    const result = getResult();
    expect(result.observedPaths).toContain('items');
    expect(result.observedPaths).toContain('items.0');
    expect(result.observedPaths).toContain('items.0.id');
    expect(result.observedPaths).toContain('items.1');
    expect(result.observedPaths).toContain('items.1.id');
  });

  it('returns sorted paths', () => {
    const { proxy, getResult } = createTracedProxy({ z: 1, a: 2, m: 3 });

    void (proxy as any).z;
    void (proxy as any).a;
    void (proxy as any).m;

    const result = getResult();
    expect(result.observedPaths).toEqual(['a', 'm', 'z']);
  });

  it('deduplicates repeated accesses', () => {
    const { proxy, getResult } = createTracedProxy({ x: 1 });

    void (proxy as any).x;
    void (proxy as any).x;
    void (proxy as any).x;

    const result = getResult();
    expect(result.observedPaths.filter(p => p === 'x')).toHaveLength(1);
  });

  it('handles for-of iteration over arrays', () => {
    const { proxy, getResult } = createTracedProxy({
      entities: [{ name: 'A' }, { name: 'B' }],
    });

    for (const entity of (proxy as any).entities) {
      void entity.name;
    }

    const result = getResult();
    expect(result.observedPaths).toContain('entities');
    expect(result.observedPaths).toContain('entities.0.name');
    expect(result.observedPaths).toContain('entities.1.name');
  });
});
