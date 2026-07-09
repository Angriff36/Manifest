/**
 * Import path resolution for wiring consumer inspection.
 *
 * Adapted from codebase-explorer
 * `src/reconcile/featureCompleteness/importPathResolver.ts`.
 */

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function resolveImportPath(
  fromFile: string,
  specifier: string,
  fileContents: Map<string, string>,
  caseInsensitive: boolean,
): string | undefined {
  const keys = [...fileContents.keys()];
  const find = (candidate: string): string | undefined => {
    const norm = normalizeRepoPath(candidate);
    return keys.find(k => {
      const key = normalizeRepoPath(k);
      return caseInsensitive ? key.toLowerCase() === norm.toLowerCase() : key === norm;
    });
  };

  if (specifier.startsWith('@/')) {
    return findWithSuffix(keys, specifier.slice(2), caseInsensitive);
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
      find(`${joined}.ts`)
      ?? find(`${joined}.tsx`)
      ?? find(`${joined}/index.ts`)
      ?? find(`${joined}/index.tsx`)
    );
  }

  return undefined;
}

function findWithSuffix(
  keys: string[],
  suffix: string,
  caseInsensitive: boolean,
): string | undefined {
  const normSuffix = normalizeRepoPath(suffix);
  const candidates = [
    `${normSuffix}.ts`,
    `${normSuffix}.tsx`,
    `${normSuffix}/index.ts`,
    `${normSuffix}/index.tsx`,
  ];
  for (const candidate of candidates) {
    const hit = keys.find(k => {
      const key = normalizeRepoPath(k);
      if (caseInsensitive) {
        return key.toLowerCase().endsWith(candidate.toLowerCase());
      }
      return key.endsWith(candidate);
    });
    if (hit) return hit;
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
