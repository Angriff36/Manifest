/**
 * Import path resolution for wiring consumer inspection.
 *
 * Adapted from codebase-explorer
 * `src/reconcile/featureCompleteness/importPathResolver.ts`.
 *
 * FilePathIndex keeps lookups O(1) — linear scans over 10k+ files made
 * full Capsule-Pro inspection unusable as a repo-wide gate.
 */

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Precomputed path lookup tables for a scan universe. */
export class FilePathIndex {
  private readonly exact = new Map<string, string>();
  /** Trailing path fragments → canonical file key (shortest wins). */
  private readonly byTail = new Map<string, string>();

  constructor(
    fileContents: Map<string, string>,
    private readonly caseInsensitive: boolean,
  ) {
    for (const key of fileContents.keys()) {
      const norm = normalizeRepoPath(key);
      this.setExact(norm, key);

      const noExt = norm.replace(/\.(tsx?|jsx?)$/, '');
      this.indexTails(noExt, key);
      this.setExact(`${noExt}.ts`, key);
      this.setExact(`${noExt}.tsx`, key);
      this.setExact(`${noExt}/index.ts`, key);
      this.setExact(`${noExt}/index.tsx`, key);
    }
  }

  private setExact(pathKey: string, file: string): void {
    const k = this.caseInsensitive ? pathKey.toLowerCase() : pathKey;
    if (!this.exact.has(k)) this.exact.set(k, file);
  }

  private indexTails(noExtPath: string, file: string): void {
    const parts = noExtPath.split('/').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const tail = parts.slice(i).join('/');
      this.setTail(tail, file);
      this.setTail(`${tail}.ts`, file);
      this.setTail(`${tail}.tsx`, file);
      this.setTail(`${tail}/index.ts`, file);
      this.setTail(`${tail}/index.tsx`, file);
    }
  }

  private setTail(tail: string, file: string): void {
    const k = this.caseInsensitive ? tail.toLowerCase() : tail;
    const existing = this.byTail.get(k);
    // Prefer shorter absolute path (closer to package root / alias target)
    if (!existing || file.length < existing.length) {
      this.byTail.set(k, file);
    }
  }

  findExact(candidate: string): string | undefined {
    const norm = normalizeRepoPath(candidate);
    const k = this.caseInsensitive ? norm.toLowerCase() : norm;
    return this.exact.get(k);
  }

  findWithSuffix(suffix: string): string | undefined {
    const norm = normalizeRepoPath(suffix);
    const candidates = [
      norm,
      `${norm}.ts`,
      `${norm}.tsx`,
      `${norm}/index.ts`,
      `${norm}/index.tsx`,
    ];
    for (const c of candidates) {
      const hit = this.findExact(c) ?? this.byTail.get(this.caseInsensitive ? c.toLowerCase() : c);
      if (hit) return hit;
    }
    return undefined;
  }
}

const indexCache = new WeakMap<Map<string, string>, FilePathIndex>();

function getIndex(
  fileContents: Map<string, string>,
  caseInsensitive: boolean,
): FilePathIndex {
  let idx = indexCache.get(fileContents);
  if (!idx) {
    idx = new FilePathIndex(fileContents, caseInsensitive);
    indexCache.set(fileContents, idx);
  }
  return idx;
}

export function resolveImportPath(
  fromFile: string,
  specifier: string,
  fileContents: Map<string, string>,
  caseInsensitive: boolean,
): string | undefined {
  const index = getIndex(fileContents, caseInsensitive);

  if (specifier.startsWith('@/')) {
    return index.findWithSuffix(specifier.slice(2));
  }

  if (specifier.startsWith('.')) {
    const base = normalizeRepoPath(fromFile).split('/');
    base.pop();
    for (const part of specifier.split('/')) {
      if (part === '.') continue;
      if (part === '..') {
        base.pop();
        continue;
      }
      base.push(part);
    }
    const joined = base.join('/');
    return (
      index.findExact(`${joined}.ts`) ??
      index.findExact(`${joined}.tsx`) ??
      index.findExact(`${joined}/index.ts`) ??
      index.findExact(`${joined}/index.tsx`)
    );
  }

  return undefined;
}

export function parseImportSpecifiers(
  content: string,
): Array<{ symbols: string[]; specifier: string }> {
  const out: Array<{ symbols: string[]; specifier: string }> = [];
  const re = /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const named = m[1];
    const defaultSym = m[2];
    const specifier = m[3]!;
    const symbols = named
      ? named
          .split(',')
          .map(s => s.trim().split(/\s+as\s+/)[0]!.trim())
          .filter(Boolean)
      : defaultSym
        ? [defaultSym]
        : [];
    if (symbols.length > 0) out.push({ symbols, specifier });
  }
  return out;
}

export function parseSideEffectImports(content: string): string[] {
  const specs: string[] = [];
  const re = /import\s+['"](\.[^'"]+)['"]\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    specs.push(m[1]!);
  }
  return specs;
}

export function resolveLocalImportClosure(
  entryFile: string,
  fileContents: Map<string, string>,
  caseInsensitive: boolean,
  maxDepth = 4,
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ file: string; depth: number }> = [{ file: entryFile, depth: 0 }];
  const out: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = normalizeRepoPath(current.file);
    const seenKey = caseInsensitive ? key.toLowerCase() : key;
    if (visited.has(seenKey)) continue;
    visited.add(seenKey);
    out.push(current.file);

    if (current.depth >= maxDepth) continue;
    const content = fileContents.get(current.file);
    if (!content) continue;

    for (const imp of parseImportSpecifiers(content)) {
      if (!imp.specifier.startsWith('.')) continue;
      const resolved = resolveImportPath(
        current.file,
        imp.specifier,
        fileContents,
        caseInsensitive,
      );
      if (resolved) queue.push({ file: resolved, depth: current.depth + 1 });
    }
    for (const specifier of parseSideEffectImports(content)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveImportPath(
        current.file,
        specifier,
        fileContents,
        caseInsensitive,
      );
      if (resolved) queue.push({ file: resolved, depth: current.depth + 1 });
    }
  }

  return out;
}
