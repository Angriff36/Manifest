/**
 * Resolves UI/API fetch calls to Next.js App Router handlers.
 *
 * Adapted from codebase-explorer
 * `src/reconcile/featureCompleteness/ProductionFlowParser.ts`
 * (handler index built from file paths — no ExplorerNode dependency).
 */

import {
  apiPathFromRouteFile,
  bracketRoutePathToRegex,
  dynamicRouteProbePath,
  normalizeApiPath,
  type RouteHelperIndex,
} from './route-helper-index.js';
import { normalizeRepoPath } from './import-path-resolver.js';

export interface ApiHandlerLink {
  apiPath: string;
  handlerPath: string;
}

export class ProductionFlowParser {
  private readonly handlerIndex: {
    exact: Map<string, string>;
    dynamic: Array<{ pattern: RegExp; handler: string; apiPath: string }>;
  };

  constructor(fileContents: Map<string, string>) {
    this.handlerIndex = buildHandlerIndex(fileContents);
  }

  resolveHandlersFromUi(content: string, routeHelpers?: RouteHelperIndex): ApiHandlerLink[] {
    const out: ApiHandlerLink[] = [];
    for (const apiPath of extractFetchApiPaths(content)) {
      const handlerPath = this.resolveHandlerForApiPath(apiPath);
      if (handlerPath) out.push({ apiPath, handlerPath });
    }
    for (const apiPath of extractApiFetchLiteralPaths(content)) {
      const handlerPath = this.resolveHandlerForApiPath(apiPath);
      if (handlerPath) out.push({ apiPath, handlerPath });
    }
    if (routeHelpers) {
      for (const helperName of extractApiFetchHelperNames(content)) {
        const helper = routeHelpers.resolve(helperName);
        if (!helper) continue;
        const handlerPath = this.resolveHandlerForHelperPattern(helper.pathPattern);
        if (!handlerPath) continue;
        out.push({ apiPath: `helper:${helperName}`, handlerPath });
      }
    }
    return out;
  }

  resolveHandlerForApiPath(apiPath: string): string | undefined {
    const norm = normalizeApiPath(apiPath);
    if (this.handlerIndex.exact.has(norm)) return this.handlerIndex.exact.get(norm);
    for (const entry of this.handlerIndex.dynamic) {
      if (entry.pattern.test(norm)) return entry.handler;
    }
    return undefined;
  }

  resolveHandlerForHelperPattern(pattern: RegExp): string | undefined {
    for (const [path, handler] of this.handlerIndex.exact) {
      if (pattern.test(path)) return handler;
    }
    for (const entry of this.handlerIndex.dynamic) {
      const probe = dynamicRouteProbePath(entry.apiPath);
      if (pattern.test(probe)) return entry.handler;
    }
    return undefined;
  }
}

function buildHandlerIndex(fileContents: Map<string, string>): {
  exact: Map<string, string>;
  dynamic: Array<{ pattern: RegExp; handler: string; apiPath: string }>;
} {
  const exact = new Map<string, string>();
  const dynamic: Array<{ pattern: RegExp; handler: string; apiPath: string }> = [];
  for (const filePath of fileContents.keys()) {
    const apiPath = apiPathFromRouteFile(normalizeRepoPath(filePath));
    if (!apiPath) continue;
    const norm = normalizeApiPath(apiPath);
    if (/\[[^\]]+\]/.test(norm)) {
      dynamic.push({
        pattern: bracketRoutePathToRegex(norm),
        handler: filePath,
        apiPath: norm,
      });
    } else {
      exact.set(norm, filePath);
    }
  }
  return { exact, dynamic };
}

function extractFetchApiPaths(content: string): string[] {
  const paths = new Set<string>();
  const re = /fetch\s*\(\s*(["'])(\/api\/[^"'\n]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    paths.add(normalizeApiPath(m[2]!));
  }
  return [...paths];
}

function extractApiFetchLiteralPaths(content: string): string[] {
  const paths = new Set<string>();
  const re = /apiFetch\s*\(\s*(["'])(\/api\/[^"'\n]+)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    paths.add(normalizeApiPath(m[2]!));
  }
  return [...paths];
}

function extractApiFetchHelperNames(content: string): string[] {
  const names = new Set<string>();
  const re = /apiFetch\s*\(\s*(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) names.add(m[1]!);
  return [...names];
}
