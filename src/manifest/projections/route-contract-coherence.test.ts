/**
 * Cross-projection route-contract coherence gate.
 *
 * A client that calls a URL no route serves, or reads a response field the
 * server never returns, is a silent runtime 404 / undefined — exactly the drift
 * the 2026-07-01 audit flagged ("No single source of truth for cross-projection
 * contracts"). This harness generates server + client surfaces from ONE IR and
 * ONE set of options and asserts they agree:
 *   (a) every URL the client calls maps to an emitted route artifact,
 *   (b) every envelope field the client reads is one the server actually returns,
 *   (c) the canonical dispatcher exists wherever the client targets it.
 *
 * Seeded here with the Next.js server surfaces + the ts.client SDK. The helpers
 * are framework-neutral; the LATER AGENTS append cases in the clearly-marked
 * sections below:
 *   - Agent R (react-query + routes): react-query hooks vs the same routes.
 *   - Agent Z (zod + hono + express): zodParamsSchemaName vs hono/express imports.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { compileToIR } from '../ir-compiler';
import { getProjection } from './registry';
import { resolveRouteContract } from './shared/route-contract';
import type { IR } from '../ir';
import type { ProjectionResult } from './interface';

// A minimal but representative program: one entity with id/name (drives list +
// detail reads) and one entity command (drives the dispatcher + a client command
// caller).
const SOURCE = `
  entity Recipe {
    property id: string
    property name: string
    command create(name: string) {
      guard name != ""
      mutate name = name
    }
  }
`;

let ir: IR;

beforeAll(async () => {
  const compiled = await compileToIR(SOURCE);
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  ir = compiled.ir!;
});

// ---------------------------------------------------------------------------
// Framework-neutral coherence helpers (shared by all projections' cases).
// ---------------------------------------------------------------------------

/** Convert a route file pathHint to the URL it serves (strip src/app roots + /route.ts). */
export function urlFromRoutePathHint(pathHint: string): string {
  const segments = pathHint.split('/').filter(Boolean);
  if (segments[0] === 'src') segments.shift();
  if (segments[0] === 'app') segments.shift();
  if (segments[segments.length - 1] === 'route.ts') segments.pop();
  return `/${segments.join('/')}`;
}

/** Every backtick-delimited URL literal (starting with `/`) a generator emitted. */
export function extractClientUrls(code: string): string[] {
  const urls: string[] = [];
  const re = /`(\/[^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) urls.push(m[1]);
  return urls;
}

/** Split a URL into segments, collapsing any `${...}` interpolation to a wildcard. */
function clientSegments(url: string): string[] {
  return url
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.includes('${') ? '*' : seg));
}

/** A client URL matches a route URL if lengths agree and each segment is compatible. */
export function urlMatchesRoute(clientUrl: string, routeUrl: string): boolean {
  const c = clientSegments(clientUrl);
  const r = routeUrl.split('/').filter(Boolean);
  if (c.length !== r.length) return false;
  return c.every((seg, i) => {
    const routeSeg = r[i];
    const isParam = routeSeg.startsWith('[') && routeSeg.endsWith(']');
    return isParam || seg === '*' || seg === routeSeg;
  });
}

/** Generate one nextjs surface, optionally entity/command-scoped, and return artifacts. */
function nextjs(
  surface: string,
  options: Record<string, unknown>,
  scope?: { entity?: string; command?: string },
): ProjectionResult {
  const projection = getProjection('nextjs');
  expect(projection, 'nextjs projection is registered').toBeDefined();
  return projection!.generate(ir, { surface, options, ...scope });
}

/** Collect the emitted route URLs for the entity read/detail routes + the dispatcher. */
function emittedRouteUrls(options: Record<string, unknown>): string[] {
  const artifacts: ProjectionResult['artifacts'] = [];
  for (const entity of ir.entities) {
    artifacts.push(...nextjs('nextjs.route', options, { entity: entity.name }).artifacts);
    artifacts.push(...nextjs('nextjs.detail', options, { entity: entity.name }).artifacts);
  }
  artifacts.push(...nextjs('nextjs.dispatcher', options).artifacts);
  return artifacts.filter((a) => a.pathHint).map((a) => urlFromRoutePathHint(a.pathHint as string));
}

function clientCode(options: Record<string, unknown>): string {
  const artifacts = nextjs('ts.client', options).artifacts;
  expect(artifacts.length).toBe(1);
  return artifacts[0].code;
}

// ===========================================================================
// SECTION: nextjs server surfaces + ts.client  (owner: Workstream 2E hub)
// ===========================================================================

describe('route-contract coherence — nextjs + ts.client', () => {
  it('(a) every client URL maps to an emitted route (default options)', () => {
    const options = {};
    const routeUrls = emittedRouteUrls(options);
    const urls = extractClientUrls(clientCode(options));
    // Sanity: the client actually calls list, detail, and the dispatcher.
    expect(urls).toContain('/api/recipe/list');
    expect(urls.some((u) => u.startsWith('/api/manifest/Recipe/commands/'))).toBe(true);

    for (const url of urls) {
      const matched = routeUrls.some((route) => urlMatchesRoute(url, route));
      expect(
        matched,
        `client URL ${url} has no matching emitted route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });

  it('(a) client URLs still map after appDir change (client + routes both track appDir)', () => {
    const options = { appDir: 'app/api/v2' };
    const routeUrls = emittedRouteUrls(options);
    const urls = extractClientUrls(clientCode(options));
    // The derived apiBasePath moved with appDir — the client targets /api/v2/*.
    expect(urls).toContain('/api/v2/recipe/list');
    for (const url of urls) {
      expect(
        routeUrls.some((route) => urlMatchesRoute(url, route)),
        `client URL ${url} has no matching emitted route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });

  it('(b) client read-envelope keys match the keys the server routes return', () => {
    const options = {};
    const contract = resolveRouteContract(options);
    const listKey = contract.listEnvelopeKey('Recipe'); // 'recipes'
    const detailKey = contract.detailEnvelopeKey('Recipe'); // 'recipe'

    const listRoute = nextjs('nextjs.route', options, { entity: 'Recipe' }).artifacts[0].code;
    const detailRoute = nextjs('nextjs.detail', options, { entity: 'Recipe' }).artifacts[0].code;
    const client = clientCode(options);

    // Server writes { recipes } / { recipe }; client reads data.recipes / data.recipe.
    expect(listRoute).toContain(`manifestSuccessResponse({ ${listKey} })`);
    expect(client).toContain(`data.${listKey}`);
    expect(detailRoute).toContain(`manifestSuccessResponse({ ${detailKey} })`);
    expect(client).toContain(`data.${detailKey}`);
  });

  it('(b) client command caller reads the dispatcher command envelope (data field)', () => {
    const options = {};
    const dispatcher = nextjs('nextjs.dispatcher', options).artifacts[0].code;
    const client = clientCode(options);

    // Dispatcher returns { data, events, diagnostics }; client types the caller
    // as ManifestCommandResponse<T> (whose `data` is the command return value).
    expect(dispatcher).toContain('data: normalized.data');
    expect(client).toContain('ManifestCommandResponse');
    expect(client).toContain('data?: T;');
  });

  it('(c) the canonical dispatcher artifact exists (client only targets the dispatcher)', () => {
    // The client posts commands to the dispatcher (raw entity/command names), so
    // the dispatcher must be emitted. concreteCommandRoutes stays off by default;
    // the dispatcher is canonical in every mode.
    expect(nextjs('nextjs.dispatcher', {}).artifacts.length).toBe(1);
    expect(
      nextjs('nextjs.dispatcher', { concreteCommandRoutes: { enabled: true } }).artifacts.length,
    ).toBe(1);

    const client = clientCode({});
    // The command caller uses the RAW entity + command names, not lowercased/kebab.
    expect(extractClientUrls(client)).toContain('/api/manifest/Recipe/commands/create');
  });

  it('respects a client.fetchAdapter (imports it, aliased to apiFetch)', () => {
    const client = clientCode({
      client: { fetchAdapter: { importPath: '@/lib/api', importName: 'authedFetch' } },
    });
    expect(client).toContain('import { authedFetch as apiFetch } from "@/lib/api";');
    // The inline apiFetch helper is not emitted when an adapter is imported.
    expect(client).not.toContain('async function apiFetch');
  });
});

// ===========================================================================
// SECTION: react-query + routes  (owner: Agent R — APPEND cases below)
// ===========================================================================
//
// Use `resolveRouteContract(options)` to compute the canonical list/detail/
// dispatcher URLs, then assert the react-query hooks (react-query.hooks) call
// URLs that `urlMatchesRoute` against `emittedRouteUrls(options)`, and that the
// routes projection's command paths align with `contract.dispatcherInvocationPath`.

describe('route-contract coherence — react-query + routes', () => {
  // A program that exercises the casing bug directly: a PascalCase multi-word
  // entity (OrderLine ≠ orderline) and a camelCase command (publishRecipe ≠
  // publish-recipe). A lowercased/kebab client URL would miss the raw-name
  // dispatcher — the exact drift these cases guard against.
  const CASING_SOURCE = `
    entity OrderLine {
      property id: string
      property name: string
      command publishRecipe(name: string) {
        guard name != ""
        mutate name = name
      }
    }
  `;

  let casingIr: IR;
  beforeAll(async () => {
    const compiled = await compileToIR(CASING_SOURCE);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    casingIr = compiled.ir!;
  });

  // IR-parameterized helpers — the module-level nextjs()/emittedRouteUrls() close
  // over the top-level `ir` (Recipe); these take the program explicitly so they
  // can run against `casingIr`.
  function nextjsFor(
    program: IR,
    surface: string,
    options: Record<string, unknown>,
    scope?: { entity?: string; command?: string },
  ): ProjectionResult {
    const projection = getProjection('nextjs');
    expect(projection, 'nextjs projection is registered').toBeDefined();
    return projection!.generate(program, { surface, options, ...scope });
  }

  /** Emitted nextjs route URLs: list + detail + dispatcher, plus concrete commands when asked. */
  function routeUrlsFor(
    program: IR,
    options: Record<string, unknown>,
    opts: { concrete?: boolean } = {},
  ): string[] {
    const artifacts: ProjectionResult['artifacts'] = [];
    for (const entity of program.entities) {
      artifacts.push(
        ...nextjsFor(program, 'nextjs.route', options, { entity: entity.name }).artifacts,
      );
      artifacts.push(
        ...nextjsFor(program, 'nextjs.detail', options, { entity: entity.name }).artifacts,
      );
    }
    artifacts.push(...nextjsFor(program, 'nextjs.dispatcher', options).artifacts);
    if (opts.concrete) {
      for (const command of program.commands) {
        if (!command.entity) continue;
        artifacts.push(
          ...nextjsFor(program, 'nextjs.command', options, {
            entity: command.entity,
            command: command.name,
          }).artifacts,
        );
      }
    }
    return artifacts
      .filter((a) => a.pathHint)
      .map((a) => urlFromRoutePathHint(a.pathHint as string));
  }

  function reactQueryHooks(program: IR, options: Record<string, unknown>): string {
    const projection = getProjection('react-query');
    expect(projection, 'react-query projection is registered').toBeDefined();
    const artifacts = projection!.generate(program, {
      surface: 'react-query.hooks',
      options,
    }).artifacts;
    expect(artifacts.length).toBe(1);
    return artifacts[0].code;
  }

  function routesManifestPaths(program: IR, options: Record<string, unknown>): string[] {
    const projection = getProjection('routes');
    expect(projection, 'routes projection is registered').toBeDefined();
    const artifacts = projection!.generate(program, {
      surface: 'routes.manifest',
      options,
    }).artifacts;
    expect(artifacts.length).toBe(1);
    const manifest = JSON.parse(artifacts[0].code) as { routes: Array<{ path: string }> };
    return manifest.routes.map((r) => r.path);
  }

  // ---- (a) react-query hook URLs vs nextjs route artifacts ----

  it('(a) every react-query hook URL maps to an emitted nextjs route (default options)', () => {
    const options = {};
    const routeUrls = routeUrlsFor(casingIr, options);
    const hooks = reactQueryHooks(casingIr, options);
    const urls = extractClientUrls(hooks);

    // Reads + the RAW-name dispatcher command path; the old buggy lowercased/kebab
    // command URL must NOT appear.
    expect(urls).toContain('/api/orderline/list');
    expect(urls).toContain('/api/manifest/OrderLine/commands/publishRecipe');
    expect(hooks).not.toContain('/api/manifest/orderline/commands/publish-recipe');

    for (const url of urls) {
      expect(
        routeUrls.some((route) => urlMatchesRoute(url, route)),
        `client URL ${url} has no matching route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });

  it('(a) react-query hook URLs still map under custom appDir + kebab casing', () => {
    const options = { appDir: 'app/api/v2', routeCasing: 'kebab-case' };
    const routeUrls = routeUrlsFor(casingIr, options);
    const urls = extractClientUrls(reactQueryHooks(casingIr, options));

    expect(urls).toContain('/api/v2/order-line/list');
    expect(urls).toContain('/api/v2/manifest/OrderLine/commands/publishRecipe');

    for (const url of urls) {
      expect(
        routeUrls.some((route) => urlMatchesRoute(url, route)),
        `client URL ${url} has no matching route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });

  // ---- (b) routes-projection manifest paths vs nextjs route artifacts ----

  it('(b) routes-projection paths match nextjs routes (dispatcher mode, custom options)', () => {
    const options = { appDir: 'app/api/v2', routeCasing: 'kebab-case' };
    const routeUrls = routeUrlsFor(casingIr, options);
    const paths = routesManifestPaths(casingIr, options);

    expect(paths).toContain('/api/v2/order-line/list');
    expect(paths).toContain('/api/v2/manifest/OrderLine/commands/publishRecipe');

    for (const path of paths) {
      expect(
        routeUrls.some((route) => urlMatchesRoute(path, route)),
        `routes path ${path} has no matching nextjs route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });

  it('(b) routes-projection paths match nextjs routes (concrete mode: dispatcher + concrete)', () => {
    const options = { concreteCommandRoutes: { enabled: true } };
    const routeUrls = routeUrlsFor(casingIr, options, { concrete: true });
    const paths = routesManifestPaths(casingIr, options);

    // Both the canonical dispatcher invocation AND the deprecated concrete alias.
    expect(paths).toContain('/api/manifest/OrderLine/commands/publishRecipe');
    expect(paths).toContain('/api/orderline/publish-recipe');

    for (const path of paths) {
      expect(
        routeUrls.some((route) => urlMatchesRoute(path, route)),
        `routes path ${path} has no matching nextjs route in ${JSON.stringify(routeUrls)}`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// SECTION: zod + hono + express  (owner: Agent Z — APPEND cases below)
// ===========================================================================
//
// Assert the zod projection's emitted command-params schema export equals
// `zodParamsSchemaName(entity, command)` and that hono/express import that exact
// name (import specifiers extracted from their generated code).

describe('route-contract coherence — zod + hono + express', () => {
  // Multi-word entity + command (OrderLine.publishRecipe): the exact shape that
  // used to drift — zod emitted `PublishRecipeParamsSchema` (no entity prefix)
  // while hono/express imported `OrderLinePublishRecipeParamsSchema`, so the
  // validation import never resolved.
  const MULTIWORD_SOURCE = `
    entity OrderLine {
      property id: string
      property name: string
      command publishRecipe(title: string) {
        guard title != ""
        mutate name = title
      }
    }
  `;

  const VALIDATION_PATH = './schemas/manifest-schemas';

  let orderIr: IR;

  beforeAll(async () => {
    const compiled = await compileToIR(MULTIWORD_SOURCE);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    orderIr = compiled.ir!;
  });

  /** Generate a surface and concatenate its artifact code. */
  function gen(projectionName: string, surface: string, options: Record<string, unknown>): string {
    const projection = getProjection(projectionName);
    expect(projection, `${projectionName} projection is registered`).toBeDefined();
    const result = projection!.generate(orderIr, { surface, options });
    expect(result.artifacts.length).toBeGreaterThan(0);
    return result.artifacts.map((a) => a.code).join('\n');
  }

  /** Every `export const <Name>ParamsSchema` the zod artifact declares. */
  function zodParamsExports(zodCode: string): string[] {
    const names: string[] = [];
    const re = /export const (\w+ParamsSchema)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(zodCode)) !== null) names.push(m[1]);
    return names;
  }

  /** Names a server projection imports from the configured validation module. */
  function validationImports(serverCode: string): string[] {
    const escaped = VALIDATION_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`).exec(serverCode);
    if (!m) return [];
    return m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Route path literals from `app` / `router` / `fastify` `.get`/`.post` calls. */
  function routePaths(serverCode: string): string[] {
    const paths: string[] = [];
    const re = /\b(?:app|router|fastify)\.(?:get|post)\(\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(serverCode)) !== null) paths.push(m[1]);
    return paths;
  }

  const servers = [
    ['hono', 'hono.router'],
    ['express', 'express.router'],
  ] as const;

  it('(a) zod export names == the exact validation-import names hono AND express emit', () => {
    const zodExports = zodParamsExports(gen('zod', 'zod.schemas', {}));
    const honoImports = validationImports(
      gen('hono', 'hono.router', { validationImportPath: VALIDATION_PATH }),
    );
    const expressImports = validationImports(
      gen('express', 'express.router', { validationImportPath: VALIDATION_PATH }),
    );

    // The previously-broken multi-word case now resolves to one agreed name.
    expect(zodExports).toContain('OrderLinePublishRecipeParamsSchema');
    expect(honoImports).toContain('OrderLinePublishRecipeParamsSchema');
    expect(expressImports).toContain('OrderLinePublishRecipeParamsSchema');

    // hono and express import the same set, and every name is one zod exports.
    expect(honoImports.length).toBeGreaterThan(0);
    expect(honoImports).toEqual(expressImports);
    for (const name of honoImports) {
      expect(zodExports, `zod must export ${name}`).toContain(name);
    }
  });

  it('(b) hono/express route paths honor basePath + custom casing (contract.listPath/detailPath)', () => {
    const options = { basePath: '/api', routeCasing: 'kebab-case' };
    const contract = resolveRouteContract({ apiBasePath: '/api', routeCasing: 'kebab-case' });
    const listUrl = contract.listPath('OrderLine'); // /api/order-line/list
    const detailUrl = contract.detailPath('OrderLine', 'colon'); // /api/order-line/:id

    for (const [name, surface] of servers) {
      const paths = routePaths(gen(name, surface, options));
      expect(paths, `${name} emits the contract list path`).toContain(listUrl);
      expect(paths, `${name} emits the contract detail path`).toContain(detailUrl);
    }
  });

  it('(c) every schema name hono/express import exists in the zod artifact text', () => {
    const zodCode = gen('zod', 'zod.schemas', {});
    for (const [name, surface] of servers) {
      const imports = validationImports(
        gen(name, surface, { validationImportPath: VALIDATION_PATH }),
      );
      expect(imports.length).toBeGreaterThan(0);
      for (const schemaName of imports) {
        expect(zodCode, `${name} imports ${schemaName} which zod must emit`).toContain(
          `export const ${schemaName} =`,
        );
      }
    }
  });
});
