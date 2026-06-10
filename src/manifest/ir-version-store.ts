/**
 * IR Version Store — Types and pure logic for IR snapshot versioning.
 *
 * Provides semantic version tagging, integrity verification, changelog
 * generation, and version resolution. No filesystem I/O — that lives in
 * the CLI command layer.
 *
 * Design notes:
 *   - Deterministic: same inputs always produce same outputs.
 *   - IR is authority: versioning operates on IR, not source.
 *   - Pure functions: no side effects, no I/O.
 */

import type { IR } from './ir';
import type { IRDiffReport, MigrationReport } from './ir-diff.js';
import { diffIR, generateMigration } from './ir-diff.js';
import type { BreakingChangeReport } from './breaking-change.js';
import { classifyBreakingChanges } from './breaking-change.js';
import { computeIRHash } from './ir-compiler.js';

// ============================================================================
// Public types
// ============================================================================

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface IRVersionMeta {
  /** Monotonically increasing version number (1-based) */
  versionNumber: number;
  /** Optional semantic version tag (e.g. "1.2.3") */
  tag?: string;
  /** SHA-256 hash of the IR at save time */
  irHash: string;
  /** SHA-256 hash of the source manifest */
  contentHash: string;
  /** ISO timestamp when this version was saved */
  savedAt: string;
  /** Compiler version that generated this IR */
  compilerVersion: string;
  /** IR schema version */
  schemaVersion: string;
  /** Optional human-readable label */
  label?: string;
}

export interface IRVersionIndex {
  /** Store format version */
  storeVersion: 1;
  /** Current highest version number */
  currentVersionNumber: number;
  /** Ordered list of version metadata (oldest first) */
  versions: IRVersionMeta[];
}

export interface SaveVersionOptions {
  /** Explicit semver tag (e.g. "1.2.3") */
  tag?: string;
  /** Auto-generate tag based on diff analysis */
  autoTag?: boolean;
  /** Human-readable label */
  label?: string;
}

export interface VerifyResult {
  valid: boolean;
  storedIrHash: string;
  computedIrHash: string;
}

export interface ChangelogEntry {
  fromVersion: number;
  toVersion: number;
  fromTag?: string;
  toTag?: string;
  diffReport: IRDiffReport;
  breakingReport: BreakingChangeReport;
  migrationReport: MigrationReport;
}

// ============================================================================
// Index management (pure)
// ============================================================================

/** Create an empty version index. */
export function createVersionIndex(): IRVersionIndex {
  return { storeVersion: 1, currentVersionNumber: 0, versions: [] };
}

/** Add a version metadata entry to the index (immutable). */
export function addVersionToIndex(index: IRVersionIndex, meta: IRVersionMeta): IRVersionIndex {
  return {
    ...index,
    currentVersionNumber: meta.versionNumber,
    versions: [...index.versions, meta],
  };
}

/** Remove a tag from any version that currently holds it (immutable). */
export function removeTagFromIndex(index: IRVersionIndex, tag: string): IRVersionIndex {
  return {
    ...index,
    versions: index.versions.map(v =>
      v.tag === tag ? { ...v, tag: undefined } : v
    ),
  };
}

/** Apply a tag to a specific version number, removing it from any other version. */
export function tagVersionInIndex(index: IRVersionIndex, versionNumber: number, tag: string): IRVersionIndex {
  return {
    ...index,
    versions: index.versions.map(v =>
      v.versionNumber === versionNumber
        ? { ...v, tag }
        : v.tag === tag
          ? { ...v, tag: undefined }
          : v
    ),
  };
}

// ============================================================================
// Version metadata creation
// ============================================================================

/** Extract version metadata from an IR and provenance. */
export function createVersionMeta(
  ir: IR,
  versionNumber: number,
  options?: SaveVersionOptions,
): IRVersionMeta {
  return {
    versionNumber,
    tag: options?.tag,
    irHash: ir.provenance.irHash ?? '',
    contentHash: ir.provenance.contentHash,
    savedAt: new Date().toISOString(),
    compilerVersion: ir.provenance.compilerVersion,
    schemaVersion: ir.provenance.schemaVersion,
    label: options?.label,
  };
}

// ============================================================================
// Integrity verification
// ============================================================================

/** Recompute the IR hash and compare against the stored value. */
export async function verifyIRIntegrity(ir: IR, storedIrHash: string): Promise<VerifyResult> {
  const computedIrHash = await computeIRHash(ir);
  return {
    valid: computedIrHash === storedIrHash,
    storedIrHash,
    computedIrHash,
  };
}

// ============================================================================
// Semantic versioning
// ============================================================================

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse a semantic version string. Returns undefined for invalid input. */
export function parseSemverTag(tag: string): SemanticVersion | undefined {
  const m = SEMVER_RE.exec(tag);
  if (!m) return undefined;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

/** Format a SemanticVersion as "major.minor.patch". */
export function formatSemver(v: SemanticVersion): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Auto-increment a semantic version based on diff and breaking-change analysis.
 *
 * Rules:
 *   - Breaking changes → major bump
 *   - Compatible/deprecated changes (but no breaking) → minor bump
 *   - No changes → patch bump
 *   - No previous tag → "0.1.0"
 */
export function autoIncrementSemver(
  currentTag: string | undefined,
  diffReport: IRDiffReport,
  breakingReport: BreakingChangeReport,
): string {
  if (!currentTag) {
    // First tag ever — but if there are breaking changes, still note them
    return '0.1.0';
  }

  const parsed = parseSemverTag(currentTag);
  if (!parsed) return '0.1.0';

  if (breakingReport.summary.breaking > 0) {
    return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0 });
  }

  if (diffReport.summary.hasChanges) {
    return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  }

  return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
}

// ============================================================================
// Version resolution
// ============================================================================

/**
 * Resolve a version reference to a version number.
 *
 * Accepts:
 *   - "latest" or undefined → current version
 *   - A number string (e.g. "1", "3") → that version number
 *   - A semver tag (e.g. "1.2.3") → version with that tag
 */
export function resolveVersionRef(index: IRVersionIndex, ref?: string): number | undefined {
  if (!ref || ref === 'latest') {
    return index.currentVersionNumber || undefined;
  }

  // Try numeric
  const num = parseInt(ref, 10);
  if (!isNaN(num) && String(num) === ref) {
    return index.versions.find(v => v.versionNumber === num)?.versionNumber;
  }

  // Try tag
  const found = index.versions.find(v => v.tag === ref);
  return found?.versionNumber;
}

// ============================================================================
// Changelog generation
// ============================================================================

/**
 * Generate a changelog between two versions.
 * Uses the existing diffIR and classifyBreakingChanges engines.
 */
export function generateChangelog(
  oldIR: IR,
  newIR: IR,
  fromMeta: IRVersionMeta,
  toMeta: IRVersionMeta,
): ChangelogEntry {
  const diffReport = diffIR(oldIR, newIR);
  const breakingReport = classifyBreakingChanges(diffReport);
  const migrationReport = generateMigration(diffReport, oldIR, newIR);

  return {
    fromVersion: fromMeta.versionNumber,
    toVersion: toMeta.versionNumber,
    fromTag: fromMeta.tag,
    toTag: toMeta.tag,
    diffReport,
    breakingReport,
    migrationReport,
  };
}
