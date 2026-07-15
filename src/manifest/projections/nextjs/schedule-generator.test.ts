import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRCommand } from '../../ir';
import { generateScheduleCronRoutes, type ScheduleGeneratorOptions } from './schedule-generator.js';

const DEFAULT_OPTIONS: ScheduleGeneratorOptions = {
  runtimeImportPath: '@/lib/manifest-runtime',
  appDir: 'app/api',
};

function baseIR(overrides: Partial<IR>): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      irHash: 'h',
      compilerVersion: 'test',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function cronSchedule(name: string, cron: string) {
  return { name, commandName: name, trigger: { kind: 'cron' as const, cron } };
}

function intervalSchedule(name: string, durationMs: number) {
  return { name, commandName: name, trigger: { kind: 'interval' as const, durationMs } };
}

function entityWithApproval(withTimeout: boolean): IREntity {
  return {
    name: 'Doc',
    properties: [],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    approvals: [
      {
        name: 'review',
        command: 'publish',
        stages: [],
        ...(withTimeout ? { timeout: 24, onTimeout: 'cancel' as const } : {}),
        emits: [],
      },
    ],
  };
}

function asyncCommand(name: string): IRCommand {
  return { name, parameters: [], guards: [], actions: [], emits: [], async: true };
}

/** Parse the emitted vercel.json artifact into its crons array. */
function vercelCrons(
  artifacts: { pathHint?: string; code: string }[],
): Array<{ path: string; schedule: string }> {
  const vercel = artifacts.find((a) => a.pathHint === 'vercel.json');
  expect(vercel, 'a vercel.json artifact is emitted').toBeDefined();
  expect(vercel!.code.endsWith('\n')).toBe(true);
  return JSON.parse(vercel!.code).crons;
}

describe('generateScheduleCronRoutes — cron routes', () => {
  it('emits a cron route per cron schedule under the default app dir', () => {
    const ir = baseIR({ schedules: [cronSchedule('dailyBackup', '0 0 * * *')] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    const route = result.artifacts.find((a) => a.id === 'nextjs.schedule.dailyBackup');
    expect(route).toBeDefined();
    expect(route!.pathHint).toBe('app/api/cron/daily-backup/route.ts');
    expect(route!.code).toContain('runSchedule("dailyBackup")');
    expect(route!.code).toContain('CRON_SECRET');
    expect(route!.code).toContain(
      'import { createManifestRuntime } from "@/lib/manifest-runtime";',
    );
  });

  it('threads appDir into both the route pathHint and the vercel.json url', () => {
    const ir = baseIR({ schedules: [cronSchedule('dailyBackup', '0 0 * * *')] });
    const result = generateScheduleCronRoutes(ir, {
      runtimeImportPath: '@/lib/manifest-runtime',
      appDir: 'src/app/api',
    });

    const route = result.artifacts.find((a) => a.id === 'nextjs.schedule.dailyBackup');
    expect(route!.pathHint).toBe('src/app/api/cron/daily-backup/route.ts');

    // URL strips everything up to and including `app`, so it stays /api/cron/...
    const crons = vercelCrons(result.artifacts);
    expect(crons).toContainEqual({ path: '/api/cron/daily-backup', schedule: '0 0 * * *' });
  });

  it('registers every cron schedule in the vercel.json crons array', () => {
    const ir = baseIR({
      schedules: [
        cronSchedule('dailyBackup', '0 0 * * *'),
        cronSchedule('morningDigest', '0 9 * * *'),
      ],
    });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    const crons = vercelCrons(result.artifacts);
    expect(crons).toContainEqual({ path: '/api/cron/daily-backup', schedule: '0 0 * * *' });
    expect(crons).toContainEqual({ path: '/api/cron/morning-digest', schedule: '0 9 * * *' });
  });

  it('emits vercel.json as strict JSON (no comments)', () => {
    const ir = baseIR({ schedules: [cronSchedule('dailyBackup', '0 0 * * *')] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);
    const vercel = result.artifacts.find((a) => a.pathHint === 'vercel.json')!;
    expect(vercel.contentType).toBe('json');
    expect(() => JSON.parse(vercel.code)).not.toThrow();
    expect(vercel.code).not.toContain('//');
  });
});

describe('generateScheduleCronRoutes — approval-expiry route', () => {
  it('emits an approval-expiry route + registration when an approval declares a timeout', () => {
    const ir = baseIR({ entities: [entityWithApproval(true)] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    const route = result.artifacts.find((a) => a.id === 'nextjs.schedule.__approval_expiry__');
    expect(route).toBeDefined();
    expect(route!.pathHint).toBe('app/api/cron/manifest-approval-expiry/route.ts');
    expect(route!.code).toContain('await runtime.expireApprovals()');

    const crons = vercelCrons(result.artifacts);
    expect(crons).toContainEqual({
      path: '/api/cron/manifest-approval-expiry',
      schedule: '*/5 * * * *',
    });
  });

  it('does not emit an approval-expiry route when no approval has a timeout', () => {
    const ir = baseIR({ entities: [entityWithApproval(false)] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    expect(
      result.artifacts.find((a) => a.id === 'nextjs.schedule.__approval_expiry__'),
    ).toBeUndefined();
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics[0].code).toBe('NEXTJS_NO_SCHEDULE_ARTIFACTS');
  });
});

describe('generateScheduleCronRoutes — jobs-drain route', () => {
  it('emits a jobs-drain route importing the package worker when an async command exists', () => {
    const ir = baseIR({ commands: [asyncCommand('processReport')] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    const route = result.artifacts.find((a) => a.id === 'nextjs.schedule.__jobs_drain__');
    expect(route).toBeDefined();
    expect(route!.pathHint).toBe('app/api/cron/manifest-jobs-drain/route.ts');
    expect(route!.code).toContain(
      'import { drainJobsOnce } from "@angriff36/manifest/jobs/worker";',
    );
    expect(route!.code).toContain('drainJobsOnce(runtime)');

    const crons = vercelCrons(result.artifacts);
    expect(crons).toContainEqual({
      path: '/api/cron/manifest-jobs-drain',
      schedule: '*/5 * * * *',
    });
  });

  it('does not emit a jobs-drain route when no command is async', () => {
    const ir = baseIR({
      commands: [{ name: 'sync', parameters: [], guards: [], actions: [], emits: [] }],
    });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);
    expect(result.artifacts.find((a) => a.id === 'nextjs.schedule.__jobs_drain__')).toBeUndefined();
  });
});

describe('generateScheduleCronRoutes — gating', () => {
  it('emits nothing but an info diagnostic when there are no cron/approval/async triggers', () => {
    // An interval-only schedule is not a Vercel cron route (Vercel cron is
    // expression-based) and does not emit here.
    const ir = baseIR({ schedules: [intervalSchedule('poll', 5 * 60 * 1000)] });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('NEXTJS_NO_SCHEDULE_ARTIFACTS');
  });

  it('emits all three route kinds + one vercel.json when schedules, approvals, and async coexist', () => {
    const ir = baseIR({
      schedules: [cronSchedule('dailyBackup', '0 0 * * *')],
      entities: [entityWithApproval(true)],
      commands: [asyncCommand('processReport')],
    });
    const result = generateScheduleCronRoutes(ir, DEFAULT_OPTIONS);

    const ids = result.artifacts.map((a) => a.id).sort();
    expect(ids).toEqual(
      [
        'nextjs.schedule.__approval_expiry__',
        'nextjs.schedule.__jobs_drain__',
        'nextjs.schedule.dailyBackup',
        'nextjs.schedule.vercel-json',
      ].sort(),
    );

    const crons = vercelCrons(result.artifacts);
    expect(crons).toHaveLength(3);
  });
});
