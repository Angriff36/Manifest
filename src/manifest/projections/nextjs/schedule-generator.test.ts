import { describe, it, expect } from 'vitest';
import type { IR } from '../../ir';
import { generateScheduleCronRoutes } from './schedule-generator.js';
function irWithCronSchedule(): IR {
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
    schedules: [{
      name: 'dailyBackup',
      commandName: 'backupData',
      trigger: { kind: 'cron', cron: '0 0 * * *' },
    }],
  };
}

describe('generateScheduleCronRoutes', () => {
  it('emits a cron route per cron schedule', () => {
    const result = generateScheduleCronRoutes(irWithCronSchedule(), {
      runtimeImportPath: '@/lib/manifest-runtime',
    });

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].code).toContain('runSchedule("dailyBackup")');
    expect(result.artifacts[0].code).toContain('CRON_SECRET');
  });
});
