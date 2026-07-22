/**
 * Appendix E: `record` alias for `map`, string-keyed maps only.
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from './ir-compiler.js';

describe('map / record type alias', () => {
  it('lowers record<V> and record<string, V> to IR map', async () => {
    const src = `
entity Bag {
  property id: string
  property a: record<boolean> = {}
  property b: record<string, number>
  property c: map<string, string>
}
`;
    const { ir, diagnostics } = await compileToIR(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const props = ir?.entities[0]?.properties ?? [];
    const byName = Object.fromEntries(props.map((p) => [p.name, p.type]));
    expect(byName.a).toEqual({ name: 'map', generic: { name: 'boolean', nullable: false }, nullable: false });
    expect(byName.b).toEqual({ name: 'map', generic: { name: 'number', nullable: false }, nullable: false });
    expect(byName.c).toEqual({ name: 'map', generic: { name: 'string', nullable: false }, nullable: false });
  });

  it('rejects non-string map/record key types (by design)', async () => {
    const src = `
entity Bad {
  property id: string
  property scores: map<number, number>
}
`;
    const { diagnostics } = await compileToIR(src);
    expect(diagnostics.some((d) => /key type must be string/.test(d.message))).toBe(true);
  });
});
