/**
 * Convex orchestration surfaces (crons / http / sagas) — unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IRSchedule, IRWebhook, IRSaga } from '../../ir';
import { ConvexProjection } from './generator.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: { contentHash: 'h', compilerVersion: 'test', schemaVersion: '1.0', compiledAt: '2025-01-01T00:00:00.000Z' },
    modules: [], values: [], entities: [], enums: [], stores: [], events: [], commands: [], policies: [],
  };
}
const gen = (ir: IR, surface: string) => new ConvexProjection().generate(ir, { surface });

describe('convex.crons', () => {
  it('emits cron + interval jobs referencing the command mutations', () => {
    const ir = emptyIR();
    ir.schedules = [
      { name: 'nightly', entityName: 'Report', commandName: 'build', trigger: { kind: 'cron', cron: '0 9 * * MON' } },
      { name: 'poll', entityName: 'Inbox', commandName: 'sync', trigger: { kind: 'interval', durationMs: 300000 } },
    ] as IRSchedule[];
    const code = gen(ir, 'convex.crons').artifacts[0].code;
    expect(code).toContain('import { cronJobs } from "convex/server";');
    expect(code).toContain('const crons = cronJobs();');
    expect(code).toContain('crons.cron("nightly", "0 9 * * MON", api.mutations.Report_build');
    expect(code).toContain('crons.interval("poll", { minutes: 5 }, api.mutations.Inbox_sync');
    expect(code).toContain('export default crons;');
  });

  it('emits an empty crons file + info diagnostic when none declared', () => {
    const res = gen(emptyIR(), 'convex.crons');
    expect(res.diagnostics.some(d => d.code === 'CONVEX_NO_SCHEDULES')).toBe(true);
    expect(res.artifacts[0].code).toContain('export default crons;');
  });
});

describe('convex.http', () => {
  it('emits an httpAction route per webhook, resolving transform params against body', () => {
    const ir = emptyIR();
    ir.webhooks = [{
      name: 'stripe', path: '/webhooks/stripe', method: 'POST', command: 'record', entity: 'Payment',
      transform: [{ name: 'amount', expression: { kind: 'member', object: { kind: 'identifier', name: 'body' }, property: 'amount' } }],
    }] as IRWebhook[];
    const code = gen(ir, 'convex.http').artifacts[0].code;
    expect(code).toContain('import { httpRouter } from "convex/server";');
    expect(code).toContain('path: "/webhooks/stripe"');
    expect(code).toContain('method: "POST"');
    expect(code).toContain('const body = await request.json();');
    expect(code).toContain('await ctx.runMutation(api.mutations.Payment_record, { amount: body.amount } as any);');
    expect(code).toContain('export default http;');
  });

  it('emits an empty http router + info diagnostic when none declared', () => {
    const res = gen(emptyIR(), 'convex.http');
    expect(res.diagnostics.some(d => d.code === 'CONVEX_NO_WEBHOOKS')).toBe(true);
  });
});

describe('convex.sagas', () => {
  function sagaIR(onFailure: 'compensate' | 'abort'): IR {
    const ir = emptyIR();
    ir.sagas = [{
      name: 'Provision',
      steps: [
        { name: 's1', commandEntity: 'Account', command: 'open', compensateEntity: 'Account', compensate: 'close' },
        { name: 's2', commandEntity: 'Billing', command: 'start' },
      ],
      onFailure,
      emits: [],
    }] as IRSaga[];
    return ir;
  }

  it('emits an orchestrator action with forward steps and reverse compensation', () => {
    const code = gen(sagaIR('compensate'), 'convex.sagas').artifacts[0].code;
    expect(code).toContain('export const Provision = action({');
    expect(code).toContain('await ctx.runMutation(api.mutations.Account_open, input as any);');
    expect(code).toContain('await ctx.runMutation(api.mutations.Billing_start, input as any);');
    expect(code).toContain('completed.push(0)');
    // compensation only for the step that declares one
    expect(code).toContain('if (completed.includes(0)) await ctx.runMutation(api.mutations.Account_close, input as any);');
    expect(code).not.toContain('Billing_start, input as any);\n      throw'); // no compensate for s2
  });

  it('omits compensation when onFailure is abort', () => {
    const code = gen(sagaIR('abort'), 'convex.sagas').artifacts[0].code;
    expect(code).toContain('// onFailure: abort — no compensation');
    expect(code).not.toContain('Account_close');
  });

  it('emits an info diagnostic when no sagas declared', () => {
    expect(gen(emptyIR(), 'convex.sagas').diagnostics.some(d => d.code === 'CONVEX_NO_SAGAS')).toBe(true);
  });
});
