/**
 * Runtime read-policy gate (docs/spec/semantics.md, "Policies").
 *
 * Read policies (action `read`/`all`) are enforced at the public read surface
 * only — getInstance / getAllInstances, above masking. Denied reads fail closed:
 * getInstance returns undefined (no existence leak) and getAllInstances omits
 * denied rows. Context-only policies short-circuit once per getAllInstances
 * call; self.* policies are evaluated per row. The internal execution read path
 * (guards, actions, computed props) is un-gated, so command results are
 * unchanged (determinism preserved).
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine, EntityInstance } from './runtime-engine';

async function makeEngine(
  source: string,
  context: Record<string, unknown> = {},
  seed: (engine: RuntimeEngine) => Promise<void> = async () => {}
) {
  const { ir, diagnostics } = await compileToIR(source);
  expect(diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const engine = new RuntimeEngine(ir!, context);
  await seed(engine);
  return engine;
}

const contextOnlySource = `
entity Doc {
  property required id: string
  property title: string
}

policy adminRead read: user.role == "admin"

store Doc in memory
`;

const rowLevelSource = `
entity Doc {
  property required id: string
  property ownerId: string
  property title: string
}

policy ownerRead read: self.ownerId == user.id

store Doc in memory
`;

const commandSource = `
entity Doc {
  property required id: string
  property count: number

  command touch() {
    guard self.count >= 0
    mutate count = self.count + 1
  }
}

policy denyAllRead read: user.role == "__never__"

store Doc in memory
`;

const noPolicySource = `
entity Doc {
  property required id: string
  property title: string
}

store Doc in memory
`;

describe('Runtime read-policy gate', () => {
  describe('context-only read policy', () => {
    it('allowed context returns the row on getInstance and getAllInstances', async () => {
      const engine = await makeEngine(contextOnlySource, { user: { role: 'admin' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', title: 'A' } as EntityInstance);
        await e.createInstance('Doc', { id: 'd2', title: 'B' } as EntityInstance);
      });
      expect((await engine.getInstance('Doc', 'd1'))?.id).toBe('d1');
      expect(await engine.getAllInstances('Doc')).toHaveLength(2);
    });

    it('denied single read returns undefined (no existence leak)', async () => {
      const engine = await makeEngine(contextOnlySource, { user: { role: 'viewer' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', title: 'A' } as EntityInstance);
      });
      expect(await engine.getInstance('Doc', 'd1')).toBeUndefined();
    });

    it('denied getAllInstances short-circuits to an empty list', async () => {
      const engine = await makeEngine(contextOnlySource, { user: { role: 'viewer' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', title: 'A' } as EntityInstance);
        await e.createInstance('Doc', { id: 'd2', title: 'B' } as EntityInstance);
      });
      expect(await engine.getAllInstances('Doc')).toEqual([]);
    });
  });

  describe('row-level (self.*) read policy', () => {
    it('omits denied rows from getAllInstances and keeps allowed rows', async () => {
      const engine = await makeEngine(rowLevelSource, { user: { id: 'u1' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', ownerId: 'u1', title: 'mine' } as EntityInstance);
        await e.createInstance('Doc', { id: 'd2', ownerId: 'u2', title: 'theirs' } as EntityInstance);
      });
      const all = await engine.getAllInstances('Doc');
      expect(all.map(r => r.id)).toEqual(['d1']);
    });

    it('denies a single read of a non-owned row, allows an owned row', async () => {
      const engine = await makeEngine(rowLevelSource, { user: { id: 'u1' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', ownerId: 'u1', title: 'mine' } as EntityInstance);
        await e.createInstance('Doc', { id: 'd2', ownerId: 'u2', title: 'theirs' } as EntityInstance);
      });
      expect((await engine.getInstance('Doc', 'd1'))?.id).toBe('d1');
      expect(await engine.getInstance('Doc', 'd2')).toBeUndefined();
    });
  });

  describe('commands are unaffected by a deny-all read policy', () => {
    it('runs the command (raw read path is un-gated) even while reads are denied', async () => {
      const engine = await makeEngine(commandSource, { user: { role: 'viewer' } }, async e => {
        await e.createInstance('Doc', { id: 'd1', count: 0 } as EntityInstance);
      });
      // The deny-all read policy gates the public read surface...
      expect(await engine.getInstance('Doc', 'd1')).toBeUndefined();
      // ...but the command's guard/mutate use the un-gated internal read and succeed.
      const result = await engine.runCommand('touch', {}, { entityName: 'Doc', instanceId: 'd1' });
      expect(result.success).toBe(true);
    });
  });

  describe('no read policies', () => {
    it('returns all rows unchanged when no read policy exists', async () => {
      const engine = await makeEngine(noPolicySource, {}, async e => {
        await e.createInstance('Doc', { id: 'd1', title: 'A' } as EntityInstance);
        await e.createInstance('Doc', { id: 'd2', title: 'B' } as EntityInstance);
      });
      expect(await engine.getAllInstances('Doc')).toHaveLength(2);
      expect((await engine.getInstance('Doc', 'd1'))?.id).toBe('d1');
    });
  });
});
