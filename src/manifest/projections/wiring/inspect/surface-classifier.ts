/**
 * Path-based product surface classification for consumer inspection.
 * Definitions in generated/test/docs paths are not product consumers.
 */

import { normalizeRepoPath } from './import-path-resolver.js';
import type { WiringInspectConfig } from './types.js';

const DEFAULT_GENERATED = [
  '/generated/',
  'manifest-client.generated',
  'manifest-client/',
  '.generated.ts',
  '.generated.tsx',
  'manifest-wiring-bindings',
  'manifest-wiring-contract',
  '.ir.json',
  'commands.registry',
];

const DEFAULT_TESTS = [
  '/__tests__/',
  '/__test__/',
  '/.test.',
  '/.spec.',
  '/tests/',
  '/test/',
  '/fixtures/',
];

const DEFAULT_DOCS = ['/docs/', '/examples/', '/README', '/mintlify/'];

export class ProductSurfaceClassifier {
  private readonly generated: string[];
  private readonly tests: string[];
  private readonly docs: string[];
  private readonly exclude: string[];
  private readonly include: string[];

  constructor(
    config: Pick<WiringInspectConfig, 'generated' | 'tests' | 'docs' | 'exclude' | 'include'>,
  ) {
    this.generated = [...DEFAULT_GENERATED, ...(config.generated ?? [])];
    this.tests = [...DEFAULT_TESTS, ...(config.tests ?? [])];
    this.docs = [...DEFAULT_DOCS, ...(config.docs ?? [])];
    this.exclude = config.exclude ?? [];
    this.include = config.include ?? [];
  }

  isExcluded(filePath: string): boolean {
    const norm = normalizeRepoPath(filePath);
    if (this.include.length > 0 && !this.include.some((p) => pathIncludes(norm, p))) {
      return true;
    }
    if (this.exclude.some((p) => pathIncludes(norm, p))) return true;
    if (this.tests.some((p) => pathIncludes(norm, p))) return true;
    if (this.docs.some((p) => pathIncludes(norm, p))) return true;
    return false;
  }

  isGeneratedDefinition(filePath: string): boolean {
    const norm = normalizeRepoPath(filePath);
    return this.generated.some((p) => pathIncludes(norm, p));
  }

  /** Product UI / app surface eligible as a consumer entrypoint. */
  isProductSurface(filePath: string): boolean {
    if (this.isExcluded(filePath)) return false;
    if (this.isGeneratedDefinition(filePath)) return false;
    const norm = normalizeRepoPath(filePath);
    if (/\/app\/api\//.test(norm) && /\/route\.(ts|tsx)$/.test(norm)) return false;
    return /\.(tsx?|jsx?)$/.test(norm);
  }

  /**
   * UI entrypoints that can prove consumers.
   * Server-action / helper `.ts` modules under ui/ are product surfaces but
   * not UI entrypoints — they only count when a UI file reaches them via a used import.
   */
  isUiSurface(filePath: string): boolean {
    if (!this.isProductSurface(filePath)) return false;
    const norm = normalizeRepoPath(filePath);
    if (/(^|\/)actions\.(ts|tsx|js|jsx)$/.test(norm)) return false;
    if (/(^|\/)orphan-actions\.(ts|tsx)$/.test(norm)) return false;
    // Prefer React/page entrypoints
    if (/\.(tsx|jsx)$/.test(norm)) return true;
    if (/page\.(ts|js)$/.test(norm)) return true;
    if (/layout\.(ts|js)$/.test(norm)) return true;
    return false;
  }
}

function pathIncludes(normPath: string, pattern: string): boolean {
  const p = normalizeRepoPath(pattern);
  if (p.includes('*')) {
    const re = new RegExp(p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i');
    return re.test(normPath);
  }
  return normPath.toLowerCase().includes(p.toLowerCase());
}
