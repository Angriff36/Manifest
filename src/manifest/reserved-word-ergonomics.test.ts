/**
 * Appendix E: domain words as identifiers (contextual keywords).
 */

import { describe, expect, it } from 'vitest';
import { compileToIR } from './ir-compiler.js';
import { KEYWORDS } from './lexer.js';

describe('Appendix E reserved-word ergonomics', () => {
  it('does not reserve publish/persist/read/write/delete/execute/tenant', () => {
    for (const word of ['publish', 'persist', 'read', 'write', 'delete', 'execute', 'tenant']) {
      expect(KEYWORDS.has(word)).toBe(false);
    }
  });

  it('allows command publish() and command delete()', async () => {
    const src = `
entity Doc {
  property id: string
  property status: string = "draft"
  command publish() {
    mutate status = "published"
  }
  command delete() {
    mutate status = "deleted"
  }
}
`;
    const { ir, diagnostics } = await compileToIR(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(ir?.commands.map((c) => c.name).sort()).toEqual(['delete', 'publish']);
  });

  it('still parses policy actions and tenant declarations', async () => {
    const src = `
tenant orgId: string from context.orgId

entity Item {
  property id: string
  property orgId: string
  property name: string
}

policy canRead read: true
policy canWrite write: user.role == "admin"

entity Pipe {
  property id: string
  property note: string = ""
  command stamp() {
    publish NoteSent
    persist noteLog
  }
}

event NoteSent: "note.sent"
`;
    const { ir, diagnostics } = await compileToIR(src);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
    expect(ir?.tenant?.property).toBe('orgId');
    expect(ir?.policies.map((p) => p.action).sort()).toEqual(['read', 'write']);
    const stamp = ir?.commands.find((c) => c.name === 'stamp');
    expect(stamp?.actions.some((a) => a.kind === 'publish')).toBe(true);
    expect(stamp?.actions.some((a) => a.kind === 'persist')).toBe(true);
  });

  it('allows property names that were formerly reserved', async () => {
    const src = `
entity Meter {
  property id: string
  property read: number = 0
  property delete: boolean = false
  property tenant: string = ""
}
`;
    const { ir, diagnostics } = await compileToIR(src);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    const names = ir?.entities[0]?.properties.map((p) => p.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(['read', 'delete', 'tenant']));
  });
});
