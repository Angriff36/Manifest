import { describe, it, expect } from 'vitest';
import {
  createVersionIndex,
  addVersionToIndex,
  removeTagFromIndex,
  tagVersionInIndex,
  createVersionMeta,
  verifyIRIntegrity,
  parseSemverTag,
  formatSemver,
  autoIncrementSemver,
  resolveVersionRef,
  generateChangelog,
  type IRVersionMeta,
} from './ir-version-store';
import type { IR } from './ir';
import type { IRDiffReport } from './ir-diff';
import type { BreakingChangeReport } from './breaking-change';

// ============================================================================
// Test helpers
// ============================================================================

function makeIR(overrides?: Partial<IR>): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'abc123',
      irHash: 'def456',
      compilerVersion: '0.3.21',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function makeMeta(overrides?: Partial<IRVersionMeta>): IRVersionMeta {
  return {
    versionNumber: 1,
    irHash: 'def456',
    contentHash: 'abc123',
    savedAt: '2025-01-01T00:00:00.000Z',
    compilerVersion: '0.3.21',
    schemaVersion: '1.0',
    ...overrides,
  };
}

const noChanges: IRDiffReport = {
  summary: {
    entitiesAdded: 0, entitiesRemoved: 0, entitiesChanged: 0,
    commandsAdded: 0, commandsRemoved: 0, commandsChanged: 0,
    policiesAdded: 0, policiesRemoved: 0, policiesChanged: 0,
    eventsAdded: 0, eventsRemoved: 0, eventsChanged: 0,
    storesAdded: 0, storesRemoved: 0, storesChanged: 0,
    modulesAdded: 0, modulesRemoved: 0,
    hasChanges: false,
  },
  modules: [], entities: [], commands: [], policies: [], stores: [], events: [],
};

const compatibleChanges: IRDiffReport = {
  ...noChanges,
  summary: {
    ...noChanges.summary,
    entitiesAdded: 1,
    hasChanges: true,
  },
  entities: [{ name: 'NewEntity', change: 'added' as const, properties: [], computedProperties: [], relationships: [], constraints: [], commands: [], policies: [] }],
};

const breakingChanges: IRDiffReport = {
  ...noChanges,
  summary: {
    ...noChanges.summary,
    entitiesRemoved: 1,
    hasChanges: true,
  },
  entities: [{ name: 'OldEntity', change: 'removed' as const, module: { from: undefined, to: undefined }, properties: [], computedProperties: [], relationships: [], constraints: [], commands: [], policies: [] }],
};

const noBreaking: BreakingChangeReport = {
  classified: [],
  summary: { compatible: 1, deprecated: 0, breaking: 0, total: 1 },
  unacknowledged: [],
  acknowledged: [],
  consumerImpact: { commands: [], routes: [], projections: [] },
};

const withBreaking: BreakingChangeReport = {
  classified: [],
  summary: { compatible: 0, deprecated: 0, breaking: 1, total: 1 },
  unacknowledged: [],
  acknowledged: [],
  consumerImpact: { commands: [], routes: [], projections: [] },
};

// ============================================================================
// Tests
// ============================================================================

describe('ir-version-store', () => {
  // --------------------------------------------------------------------------
  // createVersionIndex
  // --------------------------------------------------------------------------
  describe('createVersionIndex', () => {
    it('returns an empty index with version 0', () => {
      const idx = createVersionIndex();
      expect(idx.storeVersion).toBe(1);
      expect(idx.currentVersionNumber).toBe(0);
      expect(idx.versions).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // addVersionToIndex
  // --------------------------------------------------------------------------
  describe('addVersionToIndex', () => {
    it('adds a version and updates currentVersionNumber', () => {
      const idx = createVersionIndex();
      const meta = makeMeta({ versionNumber: 1 });
      const updated = addVersionToIndex(idx, meta);
      expect(updated.currentVersionNumber).toBe(1);
      expect(updated.versions).toHaveLength(1);
      expect(updated.versions[0]).toBe(meta);
    });

    it('does not mutate the original index', () => {
      const idx = createVersionIndex();
      const meta = makeMeta({ versionNumber: 1 });
      addVersionToIndex(idx, meta);
      expect(idx.versions).toHaveLength(0);
      expect(idx.currentVersionNumber).toBe(0);
    });

    it('preserves existing versions when adding new ones', () => {
      const idx = createVersionIndex();
      const v1 = makeMeta({ versionNumber: 1 });
      const v2 = makeMeta({ versionNumber: 2 });
      const with1 = addVersionToIndex(idx, v1);
      const with2 = addVersionToIndex(with1, v2);
      expect(with2.versions).toHaveLength(2);
      expect(with2.currentVersionNumber).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // removeTagFromIndex
  // --------------------------------------------------------------------------
  describe('removeTagFromIndex', () => {
    it('removes a tag from the version that holds it', () => {
      const idx = createVersionIndex();
      const v1 = makeMeta({ versionNumber: 1, tag: '1.0.0' });
      const tagged = addVersionToIndex(idx, v1);
      const cleaned = removeTagFromIndex(tagged, '1.0.0');
      expect(cleaned.versions[0].tag).toBeUndefined();
    });

    it('does not affect versions with different tags', () => {
      const idx = createVersionIndex();
      const v1 = makeMeta({ versionNumber: 1, tag: '1.0.0' });
      const v2 = makeMeta({ versionNumber: 2, tag: '2.0.0' });
      const withBoth = addVersionToIndex(addVersionToIndex(idx, v1), v2);
      const cleaned = removeTagFromIndex(withBoth, '1.0.0');
      expect(cleaned.versions[0].tag).toBeUndefined();
      expect(cleaned.versions[1].tag).toBe('2.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // tagVersionInIndex
  // --------------------------------------------------------------------------
  describe('tagVersionInIndex', () => {
    it('applies a tag to the target version', () => {
      const idx = createVersionIndex();
      const v1 = makeMeta({ versionNumber: 1 });
      const v2 = makeMeta({ versionNumber: 2 });
      const withBoth = addVersionToIndex(addVersionToIndex(idx, v1), v2);
      const tagged = tagVersionInIndex(withBoth, 2, 'stable');
      expect(tagged.versions[1].tag).toBe('stable');
    });

    it('removes tag from any other version holding the same tag', () => {
      const idx = createVersionIndex();
      const v1 = makeMeta({ versionNumber: 1, tag: 'stable' });
      const v2 = makeMeta({ versionNumber: 2 });
      const withBoth = addVersionToIndex(addVersionToIndex(idx, v1), v2);
      const tagged = tagVersionInIndex(withBoth, 2, 'stable');
      expect(tagged.versions[0].tag).toBeUndefined();
      expect(tagged.versions[1].tag).toBe('stable');
    });
  });

  // --------------------------------------------------------------------------
  // createVersionMeta
  // --------------------------------------------------------------------------
  describe('createVersionMeta', () => {
    it('extracts metadata from IR provenance', () => {
      const ir = makeIR();
      const meta = createVersionMeta(ir, 1);
      expect(meta.versionNumber).toBe(1);
      expect(meta.irHash).toBe('def456');
      expect(meta.contentHash).toBe('abc123');
      expect(meta.compilerVersion).toBe('0.3.21');
      expect(meta.schemaVersion).toBe('1.0');
      expect(meta.savedAt).toBeTruthy();
    });

    it('applies tag and label from options', () => {
      const ir = makeIR();
      const meta = createVersionMeta(ir, 2, { tag: '1.0.0', label: 'Initial' });
      expect(meta.tag).toBe('1.0.0');
      expect(meta.label).toBe('Initial');
    });
  });

  // --------------------------------------------------------------------------
  // verifyIRIntegrity
  // --------------------------------------------------------------------------
  describe('verifyIRIntegrity', () => {
    it('returns valid when hashes match', async () => {
      const ir = makeIR();
      // The irHash in our fixture is 'def456' which won't match the actual
      // computeIRHash result, so we compute the real one first
      const { computeIRHash } = await import('./ir-compiler');
      const realHash = await computeIRHash(ir);
      const result = await verifyIRIntegrity(ir, realHash);
      expect(result.valid).toBe(true);
      expect(result.computedIrHash).toBe(realHash);
      expect(result.storedIrHash).toBe(realHash);
    });

    it('returns invalid when hashes differ', async () => {
      const ir = makeIR();
      const result = await verifyIRIntegrity(ir, 'tampered');
      expect(result.valid).toBe(false);
      expect(result.storedIrHash).toBe('tampered');
    });
  });

  // --------------------------------------------------------------------------
  // parseSemverTag
  // --------------------------------------------------------------------------
  describe('parseSemverTag', () => {
    it('parses valid semver strings', () => {
      expect(parseSemverTag('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
      expect(parseSemverTag('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
      expect(parseSemverTag('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
    });

    it('returns undefined for invalid inputs', () => {
      expect(parseSemverTag('')).toBeUndefined();
      expect(parseSemverTag('1')).toBeUndefined();
      expect(parseSemverTag('1.2')).toBeUndefined();
      expect(parseSemverTag('v1.2.3')).toBeUndefined();
      expect(parseSemverTag('1.2.3.4')).toBeUndefined();
      expect(parseSemverTag('a.b.c')).toBeUndefined();
      expect(parseSemverTag('latest')).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // formatSemver
  // --------------------------------------------------------------------------
  describe('formatSemver', () => {
    it('formats as major.minor.patch', () => {
      expect(formatSemver({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
      expect(formatSemver({ major: 0, minor: 0, patch: 0 })).toBe('0.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // autoIncrementSemver
  // --------------------------------------------------------------------------
  describe('autoIncrementSemver', () => {
    it('returns 0.1.0 for no previous tag', () => {
      expect(autoIncrementSemver(undefined, noChanges, noBreaking)).toBe('0.1.0');
    });

    it('returns 0.1.0 for invalid previous tag', () => {
      expect(autoIncrementSemver('not-semver', noChanges, noBreaking)).toBe('0.1.0');
    });

    it('bumps major on breaking changes', () => {
      expect(autoIncrementSemver('1.2.3', breakingChanges, withBreaking)).toBe('2.0.0');
    });

    it('bumps minor on compatible changes', () => {
      expect(autoIncrementSemver('1.2.3', compatibleChanges, noBreaking)).toBe('1.3.0');
    });

    it('bumps patch on no changes', () => {
      expect(autoIncrementSemver('1.2.3', noChanges, noBreaking)).toBe('1.2.4');
    });

    it('bumps major even from 0.x when breaking', () => {
      expect(autoIncrementSemver('0.5.2', breakingChanges, withBreaking)).toBe('1.0.0');
    });
  });

  // --------------------------------------------------------------------------
  // resolveVersionRef
  // --------------------------------------------------------------------------
  describe('resolveVersionRef', () => {
    const idx = createVersionIndex();
    const v1 = makeMeta({ versionNumber: 1, tag: '1.0.0' });
    const v2 = makeMeta({ versionNumber: 2, tag: '2.0.0' });
    const v3 = makeMeta({ versionNumber: 3 });
    const populated = addVersionToIndex(addVersionToIndex(addVersionToIndex(idx, v1), v2), v3);

    it('resolves "latest" to current version', () => {
      expect(resolveVersionRef(populated, 'latest')).toBe(3);
    });

    it('resolves undefined to current version', () => {
      expect(resolveVersionRef(populated)).toBe(3);
    });

    it('resolves numeric string to version number', () => {
      expect(resolveVersionRef(populated, '1')).toBe(1);
      expect(resolveVersionRef(populated, '2')).toBe(2);
    });

    it('resolves semver tag to version number', () => {
      expect(resolveVersionRef(populated, '1.0.0')).toBe(1);
      expect(resolveVersionRef(populated, '2.0.0')).toBe(2);
    });

    it('returns undefined for nonexistent version', () => {
      expect(resolveVersionRef(populated, '99')).toBeUndefined();
      expect(resolveVersionRef(populated, '9.9.9')).toBeUndefined();
    });

    it('returns undefined for empty index', () => {
      const empty = createVersionIndex();
      expect(resolveVersionRef(empty, 'latest')).toBeUndefined();
      expect(resolveVersionRef(empty)).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // generateChangelog
  // --------------------------------------------------------------------------
  describe('generateChangelog', () => {
    it('produces a changelog entry with diff, breaking, and migration reports', () => {
      const oldIR = makeIR();
      const newIR = makeIR({
        entities: [{
          name: 'User',
          module: undefined,
          properties: [
            { name: 'id', type: { name: 'uuid', nullable: false }, modifiers: ['required'] },
            { name: 'email', type: { name: 'string', nullable: false }, modifiers: ['required', 'unique'] },
          ],
          computedProperties: [],
          relationships: [],
          commands: [],
          constraints: [],
          policies: [],
        }],
      });

      const fromMeta = makeMeta({ versionNumber: 1, tag: '1.0.0' });
      const toMeta = makeMeta({ versionNumber: 2, tag: '1.1.0' });

      const changelog = generateChangelog(oldIR, newIR, fromMeta, toMeta);

      expect(changelog.fromVersion).toBe(1);
      expect(changelog.toVersion).toBe(2);
      expect(changelog.fromTag).toBe('1.0.0');
      expect(changelog.toTag).toBe('1.1.0');
      expect(changelog.diffReport.summary.hasChanges).toBe(true);
      expect(changelog.diffReport.summary.entitiesAdded).toBe(1);
      expect(changelog.breakingReport).toBeDefined();
      expect(changelog.migrationReport).toBeDefined();
    });

    it('reports no changes for identical IRs', () => {
      const ir = makeIR();
      const fromMeta = makeMeta({ versionNumber: 1 });
      const toMeta = makeMeta({ versionNumber: 2 });

      const changelog = generateChangelog(ir, ir, fromMeta, toMeta);
      expect(changelog.diffReport.summary.hasChanges).toBe(false);
    });
  });
});
