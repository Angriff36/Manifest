import { describe, expect, it } from 'vitest';
import {
  detectEntitySourceParseHeuristics,
  diffEntitySurface,
  normalizeMergeReportEntries,
} from './doctor-lib.js';

describe('doctor-lib', () => {
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

      expect(findings.some((f) => f.code === 'SOURCE_ENTITY_RAW_COMMAND_TOKENS_UNPARSED')).toBe(true);
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
