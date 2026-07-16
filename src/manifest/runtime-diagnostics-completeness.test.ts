/**
 * Diagnostics completeness — transition failure + ConcurrencyConflict payload shape.
 * Spec: docs/spec/manifest-vnext.md § Diagnostics / Nonconformance.
 */
import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

describe('Diagnostics completeness (vNext)', () => {
  it('transition failure error names property, current, attempted, and allowed values', async () => {
    const { ir } = await compileToIR(`
      entity Document {
        property status: string
        property title: string
        transition status from "published" to ["archived"]
        command revertToDraft() {
          mutate status = "draft"
        }
      }
      store Document in memory
    `);
    expect(ir).not.toBeNull();
    const runtime = new RuntimeEngine(ir!, {}, {});
    await runtime.createInstance('Document', {
      id: 'doc-1',
      status: 'published',
      title: 'T',
    });

    const result = await runtime.runCommand(
      'revertToDraft',
      {},
      { entityName: 'Document', instanceId: 'doc-1' },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Invalid state transition for 'status': 'published' -> 'draft' is not allowed. Allowed from 'published': ['archived']",
    );
    expect(result.error).toMatch(/status/);
    expect(result.error).toMatch(/published/);
    expect(result.error).toMatch(/draft/);
    expect(result.error).toMatch(/archived/);
  });

  it('ConcurrencyConflict on CommandResult includes entityType, entityId, versions, and conflictCode', async () => {
    const { ir } = await compileToIR(`
      entity Counter {
        property required id: string = ""
        property count: number = 0
        versionProperty version: number
        command create(initialCount: number) {
          mutate count = initialCount
        }
        command increment(expectedVersion: number) {
          mutate version = expectedVersion
          mutate count = self.count + 1
        }
      }
      store Counter in memory
    `);
    expect(ir).not.toBeNull();
    const runtime = new RuntimeEngine(ir!, {}, { generateId: () => 'c1' });

    const created = await runtime.runCommand(
      'create',
      { initialCount: 0 },
      { entityName: 'Counter' },
    );
    expect(created.success).toBe(true);
    const id = created.instance?.id as string;
    expect(id).toBeTruthy();

    // Stale expectedVersion (0) while stored version is already 1 after create
    const conflicted = await runtime.runCommand(
      'increment',
      { expectedVersion: 0 },
      { entityName: 'Counter', instanceId: id },
    );

    expect(conflicted.success).toBe(false);
    expect(conflicted.concurrencyConflict).toEqual({
      entityType: 'Counter',
      entityId: id,
      expectedVersion: 0,
      actualVersion: 1,
      conflictCode: 'VERSION_MISMATCH',
    });
  });
});
