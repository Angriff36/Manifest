import { ManifestProgram, CompilationError } from './types';

/**
 * Abstraction over filesystem operations, enabling in-memory testing.
 */
export interface ResolverHost {
  readFile(absPath: string): Promise<string>;
  resolvePath(fromDir: string, relativePath: string): string;
  fileExists(absPath: string): Promise<boolean>;
}

export interface ResolvedFile {
  absPath: string;
  source: string;
  program: ManifestProgram;
  /** Absolute paths of direct dependencies (from `use` declarations) */
  dependencies: string[];
}

export interface ResolutionDiagnostic {
  message: string;
  severity: 'error' | 'warning';
  file?: string;
}

export interface ResolutionResult {
  /** Files in topological order (dependencies first) */
  order: ResolvedFile[];
  files: Map<string, ResolvedFile>;
  diagnostics: ResolutionDiagnostic[];
}

type ParseFn = (source: string) => { program: ManifestProgram; errors: CompilationError[] };

/**
 * Resolves the module dependency graph from a set of entry files.
 *
 * Algorithm:
 * 1. BFS from entries: read → parse → extract uses → resolve to absolute → recurse
 * 2. Cycle detection via DFS coloring (white/grey/black)
 * 3. Topological sort via Kahn's algorithm with deterministic tie-breaking (sorted path)
 */
export async function resolveModuleGraph(
  entryPaths: string[],
  host: ResolverHost,
  parse: ParseFn,
): Promise<ResolutionResult> {
  const files = new Map<string, ResolvedFile>();
  const diagnostics: ResolutionDiagnostic[] = [];

  // Phase 1: BFS — discover and parse all files
  const queue = [...entryPaths];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const absPath = queue.shift()!;
    if (visited.has(absPath)) continue;
    visited.add(absPath);

    const exists = await host.fileExists(absPath);
    if (!exists) {
      diagnostics.push({ message: `File not found: ${absPath}`, severity: 'error', file: absPath });
      continue;
    }

    const source = await host.readFile(absPath);
    const { program, errors } = parse(source);

    for (const err of errors) {
      diagnostics.push({ message: err.message, severity: err.severity, file: absPath });
    }

    // Resolve use paths to absolute paths
    const dependencies: string[] = [];
    const seenPaths = new Set<string>();
    for (const use of program.uses) {
      const dir = absPath.replace(/[/\\][^/\\]+$/, '');
      const resolved = host.resolvePath(dir, use.path);

      if (seenPaths.has(resolved)) {
        diagnostics.push({
          message: `Duplicate use of '${use.path}' in ${absPath}`,
          severity: 'warning',
          file: absPath,
        });
        continue;
      }
      seenPaths.add(resolved);
      dependencies.push(resolved);

      if (!visited.has(resolved)) {
        queue.push(resolved);
      }
    }

    files.set(absPath, { absPath, source, program, dependencies });
  }

  // If there were file-not-found errors, we can't reliably build a graph
  if (diagnostics.some((d) => d.severity === 'error')) {
    return { order: [], files, diagnostics };
  }

  // Phase 2: Cycle detection via DFS coloring
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const path of files.keys()) color.set(path, WHITE);

  const cyclePaths: string[] = [];

  function dfs(node: string, stack: string[]): boolean {
    color.set(node, GREY);
    stack.push(node);

    const file = files.get(node);
    if (file) {
      for (const dep of file.dependencies) {
        const c = color.get(dep);
        if (c === GREY) {
          // Found cycle — extract the cycle from stack
          const cycleStart = stack.indexOf(dep);
          const cycle = stack.slice(cycleStart);
          cycle.push(dep); // close the cycle
          cyclePaths.push(...cycle);
          return true;
        }
        if (c === WHITE) {
          if (dfs(dep, stack)) return true;
        }
      }
    }

    stack.pop();
    color.set(node, BLACK);
    return false;
  }

  for (const path of files.keys()) {
    if (color.get(path) === WHITE) {
      if (dfs(path, [])) break;
    }
  }

  if (cyclePaths.length > 0) {
    const unique = [...new Set(cyclePaths)].sort();
    diagnostics.push({
      message: `Circular dependency detected: ${unique.join(' -> ')}`,
      severity: 'error',
    });
    return { order: [], files, diagnostics };
  }

  // Phase 3: Topological sort via Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const path of files.keys()) inDegree.set(path, 0);

  for (const file of files.values()) {
    for (const dep of file.dependencies) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  // Note: Kahn's algorithm processes nodes with in-degree 0 first.
  // In a dependency graph where A uses B, the edge is A → B.
  // B has in-degree 1. We want B processed first (dependencies before dependents).
  // BUT our edges are: dependent → dependency (A → B means A depends on B).
  // In Kahn's, in-degree counts incoming edges. B is depended on by A → B has in-degree 1.
  // Nodes with in-degree 0 are "roots" (no one depends on them) = leaf dependents.
  // That gives us dependents first, which is WRONG for our purpose.
  //
  // We need the REVERSE: process dependencies first.
  // So we reverse the edge direction for Kahn's: track "depended-on-by" instead.

  const reverseDegree = new Map<string, number>();
  const reverseAdj = new Map<string, string[]>();
  for (const path of files.keys()) {
    reverseDegree.set(path, 0);
    reverseAdj.set(path, []);
  }

  for (const file of files.values()) {
    for (const dep of file.dependencies) {
      // Edge: dep → file.absPath (dep must come before file)
      reverseAdj.get(dep)!.push(file.absPath);
      reverseDegree.set(file.absPath, (reverseDegree.get(file.absPath) ?? 0) + 1);
    }
  }

  // Seed with nodes that have no dependencies (in-degree 0 in reverse graph)
  const ready: string[] = [];
  for (const [path, deg] of reverseDegree) {
    if (deg === 0) ready.push(path);
  }
  // Deterministic tie-breaking: sort alphabetically
  ready.sort();

  const order: ResolvedFile[] = [];

  while (ready.length > 0) {
    // Always pick the lexicographically smallest for determinism
    ready.sort();
    const current = ready.shift()!;
    const file = files.get(current);
    if (file) order.push(file);

    for (const dependent of reverseAdj.get(current) ?? []) {
      const deg = reverseDegree.get(dependent)! - 1;
      reverseDegree.set(dependent, deg);
      if (deg === 0) ready.push(dependent);
    }
  }

  if (order.length !== files.size) {
    // This shouldn't happen if cycle detection worked, but be defensive
    diagnostics.push({
      message: 'Internal error: topological sort did not process all files',
      severity: 'error',
    });
  }

  return { order, files, diagnostics };
}
