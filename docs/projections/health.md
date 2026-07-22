# Health Projection

Created: 2026-07-15. Edit 2026-07-22: honest scaffolding messages (`stub: true`; no “verified”/“connected” lies). Edit 2026-07-22 (later): live probes via injectable `HealthProbes` / `configureHealthProbes`.

The health projection generates runtime health-check handlers from compiled Manifest IR. Use it for Kubernetes liveness/readiness probes or load-balancer checks that return structured JSON (`status`, `timestamp`, `checks`).

The projection is registered under the name `health` (`HealthCheckProjection` in `src/manifest/projections/health/generator.ts`, wired via `src/manifest/projections/builtins.ts`). There is **no** dedicated `@angriff36/manifest/projections/health` package export — retrieve it with `getProjection('health')` from `@angriff36/manifest/projections`.

## What it generates

Three surfaces:

| Surface | Default path hint | Artifact |
| ------- | ----------------- | -------- |
| `health.handler` | `src/lib/manifest-health-handler.ts` | Framework-agnostic `runHealthCheck()` plus typed `HealthReport` / `ComponentHealth` |
| `health.nextjs` | `app/api/manifest/health/route.ts` | Next.js App Router `GET` that imports the handler and maps status → HTTP |
| `health.express` | `src/middleware/manifest-health.ts` | Express `manifestHealthHandler` middleware |

An unknown surface returns diagnostic `UNKNOWN_SURFACE` (error).

`health.handler` bakes IR provenance (`contentHash`, optional `irHash`, `compilerVersion`, `schemaVersion`, `compiledAt`) into `MANIFEST_IR_META`. When enabled, it emits:

- **IR check** — without probes: healthy + baked provenance (`stub: true`). With `HealthProbes.getLiveContentHash`: compares to baked `contentHash` (mismatch → `unhealthy`).
- **Store checks** — one async function per unique `ir.stores[].target`. `memory` / `localStorage` always healthy (`stub: false`). Other targets call `probes.checkStore(target)` when provided; otherwise scaffolding (`stub: true`).
- **Outbox check** — only when a store target is `postgres` or `supabase`. With `getOutboxDepth`: reports live `depth`; otherwise scaffolding (`depth: null`, `stub: true`).

Wire probes once with `configureHealthProbes({ … })` (HTTP wrappers pick them up) or pass them to `runHealthCheck(probes)`.

Aggregation in `runHealthCheck()`: IR failure → overall `unhealthy`; all stores unhealthy → `unhealthy`; some stores unhealthy → `degraded`; outbox unhealthy while otherwise healthy → `degraded`.

`health.nextjs` / `health.express` import `runHealthCheck` from `handlerImportPath` and respond with `healthyStatus` (default 200) when `status === 'healthy'`, otherwise `unhealthyStatus` (default 503) for both `degraded` and `unhealthy`.

## Usage

```ts
import { getProjection } from '@angriff36/manifest/projections';

const projection = getProjection('health');

const handler = projection.generate(ir, { surface: 'health.handler' });
const nextjs = projection.generate(ir, { surface: 'health.nextjs' });
const express = projection.generate(ir, {
  surface: 'health.express',
  options: { handlerImportPath: './lib/manifest-health-handler' },
});
```

CLI: `manifest generate <ir> -p health` resolves via the projection registry (same path as other non-Next.js projections). Emit each surface you need; wrappers require the handler module at `handlerImportPath`.

## Options

`HealthCheckProjectionOptions` / `HEALTH_DEFAULTS` in `src/manifest/projections/health/types.ts`:

| Option | Default |
| ------ | ------- |
| `nextjsPathHint` | `app/api/manifest/health/route.ts` |
| `expressPathHint` | `src/middleware/manifest-health.ts` |
| `handlerPathHint` | `src/lib/manifest-health-handler.ts` |
| `handlerImportPath` | `@/lib/manifest-health-handler` |
| `healthyStatus` | `200` |
| `unhealthyStatus` | `503` |
| `includeIRCheck` | `true` |
| `includeStoreChecks` | `true` |
| `includeOutboxCheck` | `true` |

## Notes & limitations

- Without `HealthProbes`, non-memory store / outbox / IR checks remain scaffolding (`details.stub: true`). HTTP 200 without probes is not proof of store/outbox connectivity.
- Hosts supply live I/O (pool `SELECT 1`, outbox `COUNT(*)`, recompiled IR hash) through the probe hooks — Manifest does not bundle a vendor-specific default client.
- Next.js and Express wrappers do not generate the core handler — emit `health.handler` (or provide an equivalent module) at the configured import path.
- Projections are tooling, not runtime semantics; this does not change command execution order or IR meaning.
