/**
 * RuntimeOptions.maxParallelCommands — Config G7 concurrency seam.
 */

import { describe, expect, it } from 'vitest';
import { IRCompiler } from './ir-compiler.js';
import type { IR } from './ir.js';
import { RuntimeEngine, type CommandResult, type IdempotencyStore } from './runtime-engine.js';

async function compileTodoCreate(): Promise<IR> {
  const compiler = new IRCompiler();
  const result = await compiler.compileToIR(`
    entity Todo {
      property id: string
      property title: string

      command create(title: string) {
        guard title != ""
        mutate title = title
      }
    }
  `);
  if (!result.ir) {
    throw new Error(result.diagnostics.map((d) => d.message).join(', '));
  }
  return result.ir;
}

class HoldingIdempotencyStore implements IdempotencyStore {
  private releaseHold!: () => void;
  readonly hold = new Promise<void>((resolve) => {
    this.releaseHold = resolve;
  });
  getCalls = 0;

  release(): void {
    this.releaseHold();
  }

  async has(_key: string): Promise<boolean> {
    return false;
  }

  async get(key: string): Promise<CommandResult | undefined> {
    this.getCalls += 1;
    if (key === 'hold') await this.hold;
    return undefined;
  }

  async set(_key: string, _result: CommandResult, _tx?: unknown): Promise<void> {
    // no-op
  }
}

describe('RuntimeOptions.maxParallelCommands', () => {
  it('rejects a second top-level runCommand while the first is in flight', async () => {
    const ir = await compileTodoCreate();
    const idempotencyStore = new HoldingIdempotencyStore();
    let seq = 0;
    const engine = new RuntimeEngine(
      ir,
      {},
      {
        maxParallelCommands: 1,
        idempotencyStore,
        generateId: () => `todo-${++seq}`,
        now: () => 1,
      },
    );

    const first = engine.runCommand(
      'create',
      { title: 'one' },
      { entityName: 'Todo', idempotencyKey: 'hold' },
    );

    for (let i = 0; i < 100 && idempotencyStore.getCalls < 1; i++) {
      await Promise.resolve();
    }
    expect(idempotencyStore.getCalls).toBeGreaterThanOrEqual(1);

    const second = await engine.runCommand(
      'create',
      { title: 'two' },
      { entityName: 'Todo', idempotencyKey: 'other' },
    );
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/^PARALLEL_COMMAND_LIMIT:/);

    idempotencyStore.release();
    const firstResult = await first;
    expect(firstResult.success).toBe(true);

    const third = await engine.runCommand(
      'create',
      { title: 'three' },
      { entityName: 'Todo', idempotencyKey: 'after' },
    );
    expect(third.success).toBe(true);
  });

  it('does not limit when maxParallelCommands is unset', async () => {
    const ir = await compileTodoCreate();
    let seq = 0;
    const engine = new RuntimeEngine(
      ir,
      {},
      {
        generateId: () => `todo-${++seq}`,
        now: () => 1,
      },
    );
    const [a, b] = await Promise.all([
      engine.runCommand('create', { title: 'a' }, { entityName: 'Todo' }),
      engine.runCommand('create', { title: 'b' }, { entityName: 'Todo' }),
    ]);
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });
});
