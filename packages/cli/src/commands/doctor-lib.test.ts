import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  detectEntitySourceParseHeuristics,
  diffEntitySurface,
  inspectConfigHealth,
  loadDoctorParserClass,
  normalizeMergeReportEntries,
} from './doctor-lib.js';

describe('doctor-lib', () => {
  describe('inspectConfigHealth', () => {
    it('flags appDir/output overlap and generatedDir layout mismatch', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-doctor-cfg-'));
      await fs.writeFile(
        path.join(dir, 'manifest.config.yaml'),
        [
          'src: src/**/*.manifest',
          'output: ir/',
          'projections:',
          '  nextjs:',
          '    output: apps/api/',
          '    options:',
          '      appDir: apps/api/app/api',
          '',
        ].join('\n'),
        'utf-8',
      );
      const findings = await inspectConfigHealth(dir);
      expect(findings.some((f) => f.code === 'CONFIG_APPDIR_OUTPUT_OVERLAP')).toBe(true);
      expect(findings.some((f) => f.code === 'CONFIG_GENERATED_DIR_LAYOUT_MISMATCH')).toBe(true);
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('stays silent when appDir is relative to output and no layout mismatch', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-doctor-cfg-ok-'));
      await fs.writeFile(
        path.join(dir, 'manifest.config.yaml'),
        [
          'output: ir/',
          'projections:',
          '  nextjs:',
          '    output: apps/api/',
          '    options:',
          '      appDir: app/api',
          '      generatedDir: app',
          '',
        ].join('\n'),
        'utf-8',
      );
      const findings = await inspectConfigHealth(dir);
      expect(findings).toHaveLength(0);
      await fs.rm(dir, { recursive: true, force: true });
    });
  });

  describe('loadDoctorParserClass', () => {
    it('falls back to the source parser when the public package parser entry is unavailable', async () => {
      class FakeParser {
        parse(source: string) {
          return { program: { source }, errors: [] };
        }
      }

      const imports: string[] = [];
      const Parser = await loadDoctorParserClass(async (specifier) => {
        imports.push(specifier);
        if (specifier === '@angriff36/manifest/parser') {
          const error = new Error('Cannot find module');
          (error as NodeJS.ErrnoException).code = 'ERR_MODULE_NOT_FOUND';
          throw error;
        }
        if (specifier.endsWith('/src/manifest/parser.ts')) {
          return { Parser: FakeParser };
        }
        throw new Error(`Unexpected import: ${specifier}`);
      });

      expect(Parser).toBe(FakeParser);
      expect(imports).toEqual([
        '@angriff36/manifest/parser',
        expect.stringMatching(/\/src\/manifest\/parser\.ts$/),
      ]);
    });

    it('can load the real source parser when the public parser entry is unavailable', async () => {
      const Parser = await loadDoctorParserClass(async (specifier) => {
        if (specifier === '@angriff36/manifest/parser') {
          const error = new Error('Cannot find module');
          (error as NodeJS.ErrnoException).code = 'ERR_MODULE_NOT_FOUND';
          throw error;
        }
        return import(specifier);
      });

      const parser = new Parser();
      const result = parser.parse(`
entity KitchenTask {
  property status: string

  command claim() {
    mutate status = "claimed"
  }
}
`);

      expect(result.errors).toEqual([]);
      expect(result.program.entities[0]?.name).toBe('KitchenTask');
    });
  });

  describe('detectEntitySourceParseHeuristics', () => {
    it('flags probable parser/scanner mismatch when raw entity block has command tokens but parsed entity has none', () => {
      const source = `
entity KitchenTask {
  property status: string

  command claim(userId: string) {
    mutate self.status = "claimed"
  }
}
`;

      const findings = detectEntitySourceParseHeuristics({
        entityName: 'KitchenTask',
        source,
        parsedCommandCount: 0,
      });

      expect(findings.some((f) => f.code === 'SOURCE_ENTITY_RAW_COMMAND_TOKENS_UNPARSED')).toBe(
        true,
      );
    });

    it('does not flag when parsed command count matches raw command tokens', () => {
      const source = `
entity KitchenTask {
  command claim() {
    emit "x"
  }
}
`;

      const findings = detectEntitySourceParseHeuristics({
        entityName: 'KitchenTask',
        source,
        parsedCommandCount: 1,
      });

      expect(findings).toHaveLength(0);
    });
  });

  describe('diffEntitySurface', () => {
    it('reports missing and extra commands/properties/emits and marks drift', () => {
      const diff = diffEntitySurface({
        entityName: 'KitchenTask',
        source: {
          exists: true,
          commands: ['claim', 'start'],
          properties: ['id', 'status'],
          emits: ['KitchenTaskClaimed'],
        },
        ir: {
          exists: true,
          commands: ['start', 'complete'],
          properties: ['id'],
          emits: [],
        },
      });

      expect(diff.hasDrift).toBe(true);
      expect(diff.commands.missingInIR).toEqual(['claim']);
      expect(diff.commands.extraInIR).toEqual(['complete']);
      expect(diff.properties.missingInIR).toEqual(['status']);
      expect(diff.emits.missingInIR).toEqual(['KitchenTaskClaimed']);
    });

    it('reports entity missing in IR', () => {
      const diff = diffEntitySurface({
        entityName: 'KitchenTask',
        source: {
          exists: true,
          commands: ['claim'],
          properties: ['id'],
          emits: [],
        },
        ir: {
          exists: false,
          commands: [],
          properties: [],
          emits: [],
        },
      });

      expect(diff.hasDrift).toBe(true);
      expect(diff.entityMissingInIR).toBe(true);
    });
  });

  describe('normalizeMergeReportEntries', () => {
    it('normalizes dropped duplicate entries from a merge report object', () => {
      const report = {
        droppedDuplicates: [
          {
            type: 'entity',
            key: 'Dish',
            keptFrom: 'kitchen-a.manifest',
            droppedFrom: 'kitchen-b.manifest',
            status: 'known_duplicate_merge',
          },
        ],
      };

      const entries = normalizeMergeReportEntries(report, 'kitchen.merge-report.json');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'entity',
        key: 'Dish',
        keptFrom: 'kitchen-a.manifest',
        droppedFrom: 'kitchen-b.manifest',
        classification: 'known',
      });
    });

    it('supports alternate nested array shapes', () => {
      const report = {
        duplicates: {
          dropped: [
            {
              duplicateType: 'command',
              duplicateKey: 'KitchenTask.claim',
              kept: 'a.manifest',
              dropped: 'b.manifest',
            },
          ],
        },
      };

      const entries = normalizeMergeReportEntries(report, 'alt.merge-report.json');
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('command');
      expect(entries[0].key).toBe('KitchenTask.claim');
    });
  });
});
