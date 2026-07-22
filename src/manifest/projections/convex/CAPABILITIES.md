# Convex projection — capability map

**Date:** 2026-07-22  
~~**Date:** 2026-07-20~~  
~~**Date:** 2026-07-17~~  
~~**Date:** 2026-07-14~~  

**Authority:** this file + diagnostics emitted by `capabilities.ts` / `privacy.ts`.  
**Rule:** every IR declaration is either Supported (generated + tested), Partial
(limitation stated), or Unsupported (`CONVEX_UNSUPPORTED_*` / related warning).
"Parsed but ignored" without a diagnostic is a bug.

See also: `README.md`, `docs/internal/proposals/2026-07-14-convex-computed-properties.md`,
roadmap Part 1 M2–M7 in `docs/internal/plans/2026-07-14-full-manifest-adoption-roadmap.md`.

---

## Supported

| IR construct                                     | Surface                      | Notes                                                                                        |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| Persistent entities + properties                 | schema                       | Skips `external`, memory/localStorage stores; skips `id` (→ `_id`)                           |
| Enums / nullable / arrays (`array`/`list`)       | schema                       |                                                                                              |
| Relationships belongsTo/ref FK + indexes         | schema + queries             | `referenceMode` convexId \| stringId                                                         |
| `indexed`, tenant index, option indexes          | schema + queries             | Index/query parity                                                                           |
| `searchable` (string/text/uuid)                  | schema                       | Emits `.searchIndex("search_<field>", { searchField })`; tenant → `filterFields` when set    |
| Commands → mutations                             | mutations                    | Order: rateLimit → policies → guards → constraints → mutate → emit → react                   |
| Command policies / guards / constraints          | mutations                    | Fail-closed; `CONVEX_UNRESOLVED_*` + denying throw; constraint `failWhen` polarity honored   |
| Roles + `roleAllows`                             | queries + mutations          | Target-aware `ROLE_PERMISSIONS` + `checkRole`                                                |
| Events + G7 emit payloads                        | mutations                    | `manifestEvents` table                                                                       |
| Reactions (resolve, fanOut, count aggregates)    | mutations                    |                                                                                              |
| Transitions                                      | mutations                    | Pre-patch legality; same-state (`from === to`) allowed; always on                            |
| Command idempotency (`idempotencyKey`)           | schema + mutations           | `commandIdempotencyKeys` table; optional arg; cached result before re-execution (default on) |
| Command `rateLimit`                              | schema + mutations           | Sliding-window `commandRateLimitBuckets`; before policies/guards; user/tenant need auth seam |
| Policy `rateLimit` (write/execute/delete)        | schema + mutations           | Same bucket table; `policy:<name>` key; before each policy expression                        |
| `versionProperty` / `versionAtProperty` OCC      | schema + mutations           | Schema field synthesis; create seeds `1`; updates optional expected version + increment      |
| Private properties (read strip)                  | queries                      | Always on; mutation path still sees stored values                                            |
| `masked` / `unmask when`                         | queries                      | Read-time strategies on list/get; unmaskWhen when Convex-renderable; mutations stay unmasked |
| Computed (self-only)                             | computed (+ optional inline) | `computedProperties: helpers \| inline`                                                      |
| Schedules                                        | crons                        |                                                                                              |
| Webhooks (route + transform + idempotency table) | http                         | HMAC signature verify (Web Crypto) + idempotency table when declared                         |
| Authenticated command dispatcher                 | http                         | `POST /api/manifest/{entity}/commands/{command}`; `ctx.auth` → existing mutation             |
| Sagas (steps + compensate/abort)                 | sagas                        | Shared `input` forwarded to every step (IR has no per-step arg map)                          |
| Tenant filter / soft-delete filter               | queries                      | Field-aware defaults                                                                         |
| `authContextImport`                              | queries + mutations          | Author-owned identity seam (also used after HTTP auth propagates into `runMutation`)         |
| `flagProviderImport` / `flag()`                  | queries + mutations          | Author-owned `flag(name)` module; required for public read policies that call `flag()`       |
| `encryptionImport` / encrypted properties        | queries + mutations          | Versioned envelope; decrypt before policy/read projection, encrypt before store writes       |
| React client hooks (`useQuery` / `useMutation`)  | react                        | Skips only read-gated entities whose public policy queries cannot be rendered                |

## Partial (limitation stated)

| IR construct                  | Limitation                                                                                                                   | Diagnostic / note                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `trustedSource` params        | Exposed as normal args unless auth/create seam injects                                                                       | `CONVEX_PARTIAL_TRUSTED_SOURCE` (info) |
| Referential onDelete/onUpdate | No schema cascade                                                                                                            | `CONVEX_REFERENTIAL_ACTION_DEFERRED`   |
| Computed relation aggregates  | Self-only helpers; `count_of`/`sum`/`avg`/`min_of`/`max_of`/`filter`/`map`/`flat_map` on hydrated hasMany in mutations      | Unresolved → `CONVEX_UNRESOLVED_COMPUTED` |
| Read/`all` policies           | Public with `authContextImport` (+ `flagProviderImport` when policies call `flag()`); `belongsTo`/`ref` + one-hop `hasMany` + `hasMany through` (single-column join FKs) hydration; composite/missing join edges and read `rateLimit` remain internal | `CONVEX_UNSUPPORTED_READ_POLICY_*`     |
| `policyMode: 'skip'`          | Omits authorization only                                                                                                     | Documented escape hatch                |
| `realtime` hint               | Convex queries already reactive; no SSE artifact                                                                             | `CONVEX_PARTIAL_REALTIME` (info)       |
| Computed `cache` directives   | Helpers stay pure; Manifest cache strategies not lowered                                                                     | `CONVEX_PARTIAL_COMPUTED_CACHE` (info) |

## Unsupported (diagnostic always emitted when declared)

| IR construct                                  | Diagnostic code                    |
| --------------------------------------------- | ---------------------------------- |
| Approvals (rejected)                          | `CONVEX_UNSUPPORTED_APPROVAL` (error) — no stage state / pre-command gate |
| `searchable` (non-string types)               | `CONVEX_UNSUPPORTED_SEARCHABLE`    |
| Command `retry` (rejected)                    | `CONVEX_UNSUPPORTED_RETRY` (error) — no per-attempt rollback/sleep in mutations |
| Read / `all` policy `rateLimit`               | `CONVEX_UNSUPPORTED_RATE_LIMIT` / `CONVEX_UNSUPPORTED_READ_POLICY_RATE_LIMIT` (queries cannot mutate buckets) |
| `async` commands / job queue (rejected)       | `CONVEX_UNSUPPORTED_ASYNC_COMMAND` (error) — no job queue/drain emit |
| Action kinds `effect` / `publish` / `persist` | `CONVEX_UNSUPPORTED_ACTION_KIND` (error) — no mutation lowering |

## Intentionally out of scope

| Construct                                   | Why                         |
| ------------------------------------------- | --------------------------- |
| Reference runtime engine / in-memory stores | Different projection target |
| Prisma / Next.js / Zod / react-query        | Separate projections        |

---

Edits to this matrix must ship with matching diagnostic codes in `capabilities.ts`
(or `privacy.ts` for encrypted) and a unit test asserting the diagnostic fires.
