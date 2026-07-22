/**
 * Shared IR-module → path-segment helpers for per-module artifact nesting.
 */

/** Sanitize an IR module name into a single path segment. */
export function moduleDirSegment(moduleName: string | undefined): string | undefined {
  if (typeof moduleName !== 'string') return undefined;
  const cleaned = moduleName
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : undefined;
}
