/**
 * Unit tests for the cross-projection route/envelope/name contract.
 *
 * These pin the exact strings every projection depends on — casing, overrides,
 * param styles, envelope keys, and the derived api/dispatcher bases — so a
 * change that would desync a client from its routes fails here first.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveRouteContract,
  resolveEntitySegment,
  listEnvelopeKey,
  detailEnvelopeKey,
  zodParamsSchemaName,
  deriveApiBasePath,
} from './route-contract.js';

describe('resolveEntitySegment', () => {
  it('defaults to the lowercase-flattened entity name (legacy)', () => {
    expect(resolveEntitySegment('PrepTask')).toBe('preptask');
    expect(resolveEntitySegment('Recipe')).toBe('recipe');
  });

  it('applies routeCasing', () => {
    expect(resolveEntitySegment('PrepTask', { routeCasing: 'kebab-case' })).toBe('prep-task');
    expect(resolveEntitySegment('PrepTask', { routeCasing: 'snake_case' })).toBe('prep_task');
    expect(resolveEntitySegment('PrepTask', { routeCasing: 'preserve' })).toBe('PrepTask');
  });

  it('routeSegments override wins over casing and may be multi-segment', () => {
    expect(
      resolveEntitySegment('OrderLine', {
        routeSegments: { OrderLine: 'order-lines' },
        routeCasing: 'kebab-case',
      }),
    ).toBe('order-lines');
    expect(resolveEntitySegment('Event', { routeSegments: { Event: 'events/event' } })).toBe(
      'events/event',
    );
  });
});

describe('deriveApiBasePath', () => {
  it('strips the src/app routing roots Next.js omits from the URL', () => {
    expect(deriveApiBasePath('app/api')).toBe('/api');
    expect(deriveApiBasePath('src/app/api')).toBe('/api');
    expect(deriveApiBasePath('app/api/v2')).toBe('/api/v2');
    expect(deriveApiBasePath('app')).toBe('');
  });
});

describe('envelope keys', () => {
  it('list key is the naive `${camelEntity}s`', () => {
    expect(listEnvelopeKey('Recipe')).toBe('recipes');
    expect(listEnvelopeKey('OrderLine')).toBe('orderLines');
  });

  it('detail key is the camelEntity', () => {
    expect(detailEnvelopeKey('Recipe')).toBe('recipe');
    expect(detailEnvelopeKey('OrderLine')).toBe('orderLine');
  });
});

describe('zodParamsSchemaName', () => {
  it('is `${Entity}${Command}ParamsSchema`, capitalize-first (matches hono/express)', () => {
    expect(zodParamsSchemaName('Recipe', 'create')).toBe('RecipeCreateParamsSchema');
    expect(zodParamsSchemaName('OrderLine', 'publishRecipe')).toBe(
      'OrderLinePublishRecipeParamsSchema',
    );
  });
});

describe('resolveRouteContract — defaults', () => {
  const c = resolveRouteContract();

  it('derives coherent api + dispatcher bases from the default appDir', () => {
    expect(c.apiBasePath).toBe('/api');
    expect(c.dispatcherBasePath).toBe('/api/manifest');
    expect(c.appDir).toBe('app/api');
  });

  it('produces read/detail URLs matching the emitted route pathHints', () => {
    expect(c.listPath('Recipe')).toBe('/api/recipe/list');
    expect(c.detailPath('Recipe')).toBe('/api/recipe/[id]');
    expect(c.listRoutePathHint('Recipe')).toBe('app/api/recipe/list/route.ts');
    expect(c.detailRoutePathHint('Recipe')).toBe('app/api/recipe/[id]/route.ts');
  });

  it('dispatcher URL template matches its route pathHint, invocation uses raw names', () => {
    expect(c.dispatcherPath()).toBe('/api/manifest/[entity]/commands/[command]');
    expect(c.dispatcherPath('colon')).toBe('/api/manifest/:entity/commands/:command');
    expect(c.dispatcherRoutePathHint()).toBe(
      'app/api/manifest/[entity]/commands/[command]/route.ts',
    );
    expect(c.dispatcherInvocationPath('Recipe', 'publishRecipe')).toBe(
      '/api/manifest/Recipe/commands/publishRecipe',
    );
  });

  it('concrete per-command path uses the kebab command slug', () => {
    expect(c.concreteCommandPath('Recipe', 'publishRecipe')).toBe('/api/recipe/publish-recipe');
    expect(c.concreteCommandRoutePathHint('Recipe', 'publishRecipe')).toBe(
      'app/api/recipe/publish-recipe/route.ts',
    );
  });
});

describe('resolveRouteContract — appDir change keeps client and routes coherent', () => {
  const c = resolveRouteContract({ appDir: 'app/api/v2' });

  it('client URL prefix tracks the route filesystem prefix', () => {
    expect(c.apiBasePath).toBe('/api/v2');
    expect(c.listPath('Recipe')).toBe('/api/v2/recipe/list');
    // Route emitted under app/api/v2/... serves /api/v2/... — the derived
    // apiBasePath matches, so the client cannot target a stale /api prefix.
    expect(c.listRoutePathHint('Recipe')).toBe('app/api/v2/recipe/list/route.ts');
    expect(c.dispatcherBasePath).toBe('/api/v2/manifest');
  });
});

describe('resolveRouteContract — explicit overrides', () => {
  it('honors an explicit apiBasePath and routeSegments', () => {
    const c = resolveRouteContract({
      apiBasePath: '/v1/api',
      routeSegments: { OrderLine: 'order-lines' },
    });
    expect(c.listPath('OrderLine')).toBe('/v1/api/order-lines/list');
    expect(c.dispatcherBasePath).toBe('/v1/api/manifest');
  });
});
