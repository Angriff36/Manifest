/**
 * Indexes Next.js route helper exports and matches dynamic App Router paths.
 *
 * Adapted from codebase-explorer
 * `src/reconcile/featureCompleteness/routeHelperIndex.ts`.
 */

import { normalizeRepoPath } from './import-path-resolver.js';

export interface RouteHelperPattern {
  helperName: string;
  sourceFile: string;
  pathPattern: RegExp;
}

export class RouteHelperIndex {
  private readonly byName = new Map<string, RouteHelperPattern>();

  static build(fileContents: Map<string, string>): RouteHelperIndex {
    const index = new RouteHelperIndex();
    for (const [filePath, content] of fileContents) {
      if (!RouteHelperIndex.looksLikeRouteHelperModule(filePath, content)) continue;
      index.ingestFile(filePath, content);
    }
    return index;
  }

  resolve(helperName: string): RouteHelperPattern | undefined {
    return this.byName.get(helperName);
  }

  private static looksLikeRouteHelperModule(filePath: string, content: string): boolean {
    const norm = normalizeRepoPath(filePath);
    if (!/(?:^|\/)routes\.(?:ts|tsx)$/.test(norm)) return false;
    return /\/api\//.test(content) && /export\s+const\s+\w+/.test(content);
  }

  private ingestFile(filePath: string, content: string): void {
    const re =
      /export\s+const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*)?(?::\s*[^=]+)?=>\s*(["'`])([\s\S]*?)\2/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const helperName = m[1]!;
      const quote = m[2]!;
      let raw = m[3]!;
      if (quote === '`') {
        raw = raw.replace(/\$\{[^}]+\}/g, ':param');
      }
      if (!raw.startsWith('/api/')) continue;
      this.byName.set(helperName, {
        helperName,
        sourceFile: filePath,
        pathPattern: templatePathToRegex(raw),
      });
    }
  }
}

export function templatePathToRegex(path: string): RegExp {
  const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  const parts = normalized.split(':param').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('[^/]+')}$`);
}

export function bracketRoutePathToRegex(apiPath: string): RegExp {
  let normalized = apiPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  normalized = normalized.replace(/\[[^\]]+\]/g, '§DYN§');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/§DYN§/g, '[^/]+')}$`);
}

/** Replace [id] segments with a concrete probe token (never leave regex fragments). */
export function dynamicRouteProbePath(apiPath: string): string {
  return normalizeApiPath(apiPath).replace(/\[[^\]]+\]/g, '__probe__');
}

export function apiPathFromRouteFile(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:tsx|ts|jsx|js)$/);
  if (!match) return undefined;
  return normalizeApiPath(`/api/${match[1]}`);
}

export function normalizeApiPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}
