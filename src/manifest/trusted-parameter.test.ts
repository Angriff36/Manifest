/**
 * Runtime semantics for trusted (server-owned) command parameters.
 * Kept outside projections/ — projections must not import the runtime engine.
 */

import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler.js';
import { RuntimeEngine } from './runtime-engine.js';

const SOURCE = `
entity Task {
  property required id: string
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property completedBy: string = ""

  command create(
    title: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    mutate title = title
    mutate tags = tags
    mutate priority = priority
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  store Task in memory
}
`;

describe('trusted command parameters (runtime)', () => {
  it('9-10. strips spoofed client actor and injects trusted actor', async () => {
    const { ir, diagnostics } = await compileToIR(SOURCE);
    expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    expect(ir).not.toBeNull();

    const engine = new RuntimeEngine(ir!, { actorId: 'trusted-user-1' });
    const result = await engine.runCommand(
      'create',
      {
        title: 'Chop onions',
        tags: ['prep'],
        priority: 3,
        dueDate: '2026-07-10',
        completedBy: 'spoofed-attacker',
      },
      { entityName: 'Task' },
    );
    expect(result.success).toBe(true);
    const instances = await engine.getAllInstances('Task');
    expect(instances.length).toBe(1);
    const row = instances[0] as unknown as { completedBy: string };
    expect(row.completedBy).toBe('trusted-user-1');
    expect(row.completedBy).not.toBe('spoofed-attacker');
  });

  it('fails closed when required trusted context is missing', async () => {
    const { ir } = await compileToIR(SOURCE);
    const engine = new RuntimeEngine(ir!, {});
    const result = await engine.runCommand(
      'create',
      {
        title: 'Chop onions',
        tags: ['prep'],
        priority: 3,
        dueDate: '2026-07-10',
      },
      { entityName: 'Task' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/MISSING_TRUSTED_CONTEXT/);
    expect(result.parameterFailure?.code).toBe('MISSING_TRUSTED_CONTEXT');
  });
});
