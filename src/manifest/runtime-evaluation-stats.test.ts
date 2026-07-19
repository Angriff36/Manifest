/**
 * Evaluation step-count instrumentation counters (vNext performance guardrails).
 * Spec: docs/spec/manifest-vnext.md § Nonconformance — Performance guardrails.
 */
import { describe, it, expect } from 'vitest';
import { compileToIR } from './ir-compiler';
import { RuntimeEngine } from './runtime-engine';

describe('EvaluationStats instrumentation counters', () => {
  async function engine(
    source: string,
    limits?: { maxEvaluationSteps?: number; maxExpressionDepth?: number },
  ) {
    const { ir } = await compileToIR(source);
    expect(ir).not.toBeNull();
    return new RuntimeEngine(ir!, {}, { evaluationLimits: limits });
  }

  it('exposes getLastEvaluationStats after a successful runCommand', async () => {
    const runtime = await engine(`
      entity Task {
        property title: string
        command create(title: string) {
          guard title != ""
          mutate title = title
        }
      }
    `);

    expect(runtime.getLastEvaluationStats()).toBeNull();

    const result = await runtime.runCommand('create', { title: 'Hi' }, { entityName: 'Task' });
    expect(result.success).toBe(true);

    const stats = runtime.getLastEvaluationStats();
    expect(stats).not.toBeNull();
    expect(stats!.stepsUsed).toBeGreaterThan(0);
    expect(stats!.peakDepth).toBeGreaterThanOrEqual(0);
    expect(stats!.maxSteps).toBe(10_000);
    expect(stats!.maxDepth).toBe(64);
  });

  it('records configured limits on the last stats snapshot', async () => {
    const runtime = await engine(
      `
      entity Task {
        property title: string
        command create(title: string) {
          guard title != ""
          mutate title = title
        }
      }
    `,
      { maxEvaluationSteps: 500, maxExpressionDepth: 12 },
    );

    await runtime.runCommand('create', { title: 'Hi' }, { entityName: 'Task' });
    const stats = runtime.getLastEvaluationStats();
    expect(stats?.maxSteps).toBe(500);
    expect(stats?.maxDepth).toBe(12);
  });

  it('still exposes stats after a step-budget failure', async () => {
    const runtime = await engine(
      `
      entity Task {
        property title: string
        command create(title: string) {
          guard title != ""
          mutate title = title
        }
      }
    `,
      { maxEvaluationSteps: 1 },
    );

    const result = await runtime.runCommand('create', { title: 'Hi' }, { entityName: 'Task' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('steps');

    const stats = runtime.getLastEvaluationStats();
    expect(stats).not.toBeNull();
    expect(stats!.stepsUsed).toBeGreaterThan(0);
    expect(stats!.maxSteps).toBe(1);
  });
});
