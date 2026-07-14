# Convex projection — capability map

**Date:** 2026-07-14  
**Authority:** this file + diagnostics emitted by `capabilities.ts` / `privacy.ts`.  
**Rule:** every IR declaration is either Supported (generated + tested), Partial
(limitation stated), or Unsupported (`CONVEX_UNSUPPORTED_*` / related warning).
"Parsed but ignored" without a diagnostic is a bug.

See also: `README.md`, `docs/internal/proposals/2026-07-14-convex-computed-properties.md`,
roadmap Part 1 M2–M7 in `docs/internal/plans/2026-07-14-full-manifest-adoption-roadmap.md`.

---

## Supported

| IR construct                                     | Surface                      | Notes                                                                                      |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Persistent entities + properties                 | schema                       | Skips `external`, memory/localStorage stores; skips `id` (→ `_id`)                         |
| Enums / nullable / arrays (`array`/`list`)       | schema                       |                                                                                            |
| Relationships belongsTo/ref FK + indexes         | schema + queries             | `referenceMode` convexId \| stringId                                                       |
| `indexed`, tenant index, option indexes          | schema + queries             | Index/query parity                                                                         |
| Commands → mutations                             | mutations                    | Order: policies → guards → constraints → mutate → emit → react                             |
| Command policies / guards / constraints          | mutations                    | Fail-closed; `CONVEX_UNRESOLVED_*` + denying throw; constraint `failWhen` polarity honored |
| Roles + `roleAllows`                             | mutations                    | `ROLE_PERMISSIONS` + `checkRole`                                                           |
| Events + G7 emit payloads                        | mutations                    | `manifestEvents` table                                                                     |
| Reactions (resolve, fanOut, count aggregates)    | mutations                    |                                                                                            |
| Transitions                                      | mutations                    | Pre-patch legality; always on                                                              |
| Private properties (read strip)                  | queries                      | Always on; mutation path still sees stored values                                          |
| Computed (self-only)                             | computed (+ optional inline) | `computedProperties: helpers \| inline`                                                    |
| Schedules                                        | crons                        |                                                                                            |
| Webhooks (route + transform + idempotency table) | http                         | Signature verification = Partial                                                           |
| Sagas (steps + compensate/abort)                 | sagas                        | Step arg mapping = Partial                                                                 |
| Tenant filter / soft-delete filter               | queries                      | Field-aware defaults                                                                       |
| `authContextImport`                              | queries + mutations          | Author-owned identity seam                                                                 |
| React client hooks (`useQuery` / `useMutation`)  | react                        | Skips read-gated (internalQuery) entities                                                  |

## Partial (limitation stated)

| IR construct                  | Limitation                                             | Diagnostic / note                                            |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Webhook `signature`           | httpAction does not verify HMAC                        | `CONVEX_UNSUPPORTED_WEBHOOK_SIGNATURE`                       |
| Saga step arguments           | Single `input` forwarded to every step                 | Documented in README                                         |
| `trustedSource` params        | Exposed as normal args unless auth/create seam injects | `CONVEX_PARTIAL_TRUSTED_SOURCE` (info)                       |
| Referential onDelete/onUpdate | No schema cascade                                      | `CONVEX_REFERENTIAL_ACTION_DEFERRED`                         |
| Computed relation aggregates  | Unresolved unless self-only / count via reactions      | `CONVEX_UNRESOLVED_COMPUTED`                                 |
| Encrypted properties          | Stored/returned as plain strings                       | `CONVEX_ENCRYPTED_UNSUPPORTED` (phase 1; phase 2 needs spec) |
| `policyMode: 'skip'`          | Omits authorization only                               | Documented escape hatch                                      |

## Unsupported (diagnostic always emitted when declared)

| IR construct                                  | Diagnostic code                     |
| --------------------------------------------- | ----------------------------------- |
| Approvals                                     | `CONVEX_UNSUPPORTED_APPROVAL`       |
| `realtime` hint                               | `CONVEX_UNSUPPORTED_REALTIME`       |
| `versionProperty` / optimistic concurrency    | `CONVEX_UNSUPPORTED_VERSION`        |
| `masked` / `unmask when`                      | `CONVEX_UNSUPPORTED_MASKED`         |
| `searchable`                                  | `CONVEX_UNSUPPORTED_SEARCHABLE`     |
| Computed `cache` directives                   | `CONVEX_UNSUPPORTED_COMPUTED_CACHE` |
| Command/policy `retry`                        | `CONVEX_UNSUPPORTED_RETRY`          |
| Command/policy `rateLimit`                    | `CONVEX_UNSUPPORTED_RATE_LIMIT`     |
| Read/`all` policies on generated queries      | `CONVEX_UNSUPPORTED_READ_POLICY`    |
| `async` commands / job queue                  | `CONVEX_UNSUPPORTED_ASYNC_COMMAND`  |
| Action kinds `effect` / `publish` / `persist` | `CONVEX_UNSUPPORTED_ACTION_KIND`    |

## Intentionally out of scope

| Construct                                   | Why                         |
| ------------------------------------------- | --------------------------- |
| Reference runtime engine / in-memory stores | Different projection target |
| Prisma / Next.js / Zod / react-query        | Separate projections        |

---

Edits to this matrix must ship with matching diagnostic codes in `capabilities.ts`
(or `privacy.ts` for encrypted) and a unit test asserting the diagnostic fires.
