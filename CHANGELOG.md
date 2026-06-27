# Changelog

All notable changes to `@angriff36/manifest` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.18.5] - 2026-06-27

_Auto-generated stub — expand with real release notes._

## [2.18.4] - 2026-06-27

### Changed

- [feat] dateSerialization option: type date/datetime as string for wire transport
- [fix] emit T[] for array/list props in react-query + nextjs TS types

## [2.18.3] - 2026-06-27

### Changed

- [fix] map float/bigint/integer to TS number in react-query + nextjs projections

## [2.18.2] - 2026-06-27

_Auto-generated stub — expand with real release notes._

## [2.18.1] - 2026-06-27

### Changed

- [ci] upgrade npm to 11+ for trusted-publishing OIDC exchange
- [ci] OIDC trusted publishing (npm forces it; token route blocked)
- [ci] publish to npm via NPM_TOKEN (OIDC exchange not firing); drop provenance/tarball workarounds
- [ci] strip stale _authToken so npm uses OIDC trusted publishing
- [ci] diag: dump OIDC claims to identify trusted-publisher mismatch
- [ci] fix tarball glob: pnpm pack to CWD, npm publish <tgz> --provenance
- [ci] publish tarball via npm CLI for trusted-publishing OIDC exchange
- [ci] add --provenance to fire npm OIDC trusted-publishing handshake
- [fix] pin publishConfig.registry to npmjs.org
- [ci] publish-first release to npm (OIDC); drop release.yml
- [fix] ts.types/react-query: map money/decimal/int to number, emit enums
- [ci] publish to npm (OIDC), drop GitHub Packages routing
- [fix] correct publish docs: npm (OIDC), not GitHub Packages
- [fix] point release publish at GitHub Packages registry

## [2.18.0] - 2026-06-24

### Added

- **Domain completeness (compile-time product wiring).** The compiler now fails on half-wired models: `{parent}Id` without `belongsTo`/`ref`, manual parent FK on `create` with no nested parent command or reaction, context-injected create params (`tenantId`, `orgId`, `userId`, audit/tracing ids, timestamps, version fields), parent-owned fields duplicated on child create, persisted domain-wired entities with no commands, and unreachable reaction wiring. Documented in `docs/spec/semantics.md` § User-Facing Boundary and § Domain Completeness.

- **Reaction completeness checks.** Orphan reactions (event nothing emits) and invalid `payload.*` references (including non-create `payload.result.*`) are compile errors; declared event payload fields are valid sources alongside emitter params.

- **`@angriff36/manifest/domain-completeness` and `@angriff36/manifest/reaction-completeness` package exports** for CLI `validate-ai` and downstream tooling.

- **`manifest validate-ai` domain category** — surfaces the same wiring checks on IR JSON with coded diagnostics (`DOMAIN_UNWIRED_FK`, `DOMAIN_ORPHAN_CREATE`, `REACTION_UNWIRED`).

### Changed

- **`validate-ai` command split** into focused modules (semantic checks, AJV formatting, report builder, file validation) for maintainability.

- **Conformance expected IR/diagnostics** regenerated where compile now emits domain/reaction warnings.

## [2.17.0] - 2026-06-23

### Changed

- **Computed-property cache invalidation now follows `self.X` / `this.X` references (bug fix, behavior-changing).** `extractDependencies` only captured bare identifiers, so a computed like `computed tax = self.subtotal * self.taxRate` listed **no** dependencies — mutating `subtotal` or `taxRate` never marked the computed stale, so derived values silently went stale. `self.X` / `this.X` member references are now tracked (a bare `X` already was), matching the runtime's stale-marking which keys on mutated property names. `user.X` / `context.X` are correctly still excluded (not instance properties). Programs that relied on the stale behavior will now see correct, up-to-date computed values.

### Added

- **Idempotent compile output (stable `compiledAt`).** `manifest compile` stamped a fresh `compiledAt: new Date()` on every run, so regenerating unchanged source produced a fake git diff every time. When the output IR already exists with the same `contentHash`, the compiler now reuses its `compiledAt` and recomputes `irHash` against it — re-compiling unchanged source is byte-identical. Affects both single-file and `--merge` paths.

- **`manifest generate --check` (drift mode).** Regenerates projection output in memory and compares it to the committed files without writing anything; exits non-zero and lists the drifted files if any generated code differs from what's committed (`prettier --check` semantics). Lets CI assert "committed code == freshly generated code" without per-projection drift scripts.

## [2.16.1] - 2026-06-19

### Added

- **Compile warning for duplicate event names.** Two declarations of the same event
  name collide in the event registry (one shadows the other); the compiler now warns.
  Surfaces in `manifest compile` and the LSP.

### Notes

- Investigated two further audit categories and deliberately did **not** add them as
  compiler diagnostics, to avoid false positives: *mutate-to-undeclared-field* (the
  runtime supports dynamic instance fields via the `EntityInstance` index signature,
  so such a write is valid, not a silent no-op — a lint smell, not a guaranteed error)
  and *event-never-emitted* (events are routinely emitted by reactions and hand-written
  runtime middleware the compiler cannot see). Both remain appropriate for an external
  audit script.

## [2.16.0] - 2026-06-19

### Added

- **`now()` / `today()` property defaults now work (`autoNow`).** A
  `property createdAt: datetime = now()` previously compiled to **no default** —
  any call-expression default was silently dropped, because `transformExprToValue`
  only handled literals. At runtime the field was then null-filled, so persisting
  to a non-null store column (e.g. Prisma `created_at`) failed with
  `Argument createdAt must not be null`. These defaults now lower to a new
  `IRProperty.autoNow` flag: the runtime stamps the current time on create, and the
  Prisma projection emits `@default(now())`. Negative numeric literal defaults
  (`= -1`), also previously dropped, now fold to a real static default.

- **Compile-time diagnostics for guaranteed-null persistence.** Two new compiler
  warnings surface failures that previously only appeared at runtime against a real
  database — both flow through the LSP (in-editor squiggles) and `manifest compile`:
  - A `create` command that leaves a **non-null, default-less** property unset, for
    the types the runtime null-fills (datetime/date/time/enum/custom). Types that
    zero-fill non-null (string/number/boolean/list/map) are not flagged. Excludes
    runtime/store-managed fields (`id`, composite keys, relationship FKs, the tenant
    property, version fields, and auto timestamps).
  - An unsupported call-expression default (e.g. `= uuid()`) that would otherwise be
    dropped without a trace.

  These are warnings, not hard errors: the runtime merges arbitrary caller-supplied
  input on create, so the compiler cannot *prove* a field is unset.

## [2.15.0] - 2026-06-18

### Changed

- **Runtime — command persistence is now batched into a single store write.**
  A command that mutated N fields previously issued N `store.update` writes plus
  ~2N reads (one `getById` + one context refresh per `mutate`/`compute` action).
  Against a pooled connection this made multi-field updates take seconds and grow
  with field/reaction count. The runtime now loads the target instance once,
  advances an in-memory working copy as actions run, accumulates one patch, and
  flushes a single `store.update` at the end of the action loop — before event
  emission and reaction dispatch, so emitted events and reactions still observe
  the final committed state. A command touching N fields now performs one read
  and one write regardless of N.

- **Runtime — failed commands are now atomic.** A `mutate`/`compute` action that
  trips a state-transition or concurrency check aborts the command without
  flushing, so a failed command persists **nothing** instead of leaving partial
  per-field writes from the actions that ran before the failure. Commands that
  succeed are unaffected. The entity flush and outbox/saga enqueue remain
  separate operations (the store interface exposes no transaction handle); the
  single entity write is atomic for its row.

## [2.14.0] - 2026-06-17

### Added

- **Reactions — aggregate count expressions (`count(Entity where fk == value, ...)`).**
  A reaction can now recompute and store a child count on a parent after a child
  event, the declarative replacement for hand-written "count children where the
  foreign key equals the parent, then patch the parent" after-emit middleware.
  `count(<Entity> where <field> == <value>, ...)` counts rows of `<Entity>`
  matching every ANDed **equality** predicate; predicate values resolve against
  the reaction's event payload like any param. The runtime scans the collection
  (deterministic); the Convex projection reads via the foreign-key predicate's
  `by_<field>` index, applies remaining predicates plus tenant/soft-delete
  filters, and binds `.length` to the param. Scope is deliberately narrow — count
  only, no group-by/joins/multi-hop. Retires capsule-pro's per-parent
  `schedule-shift-count` and `prep-task-station-count` middleware.

- **Reactions — fan-out (`on E fanOut T where f = self.x run cmd`).** A 1:N
  cascade: dispatch a command on *every* target row matching a foreign-key
  predicate, replacing the "query children by FK, loop, dispatch" middleware
  pattern (cancel every line item, release every reservation, …). The Convex
  projection reads via `withIndex` on the FK and dispatches each match through
  the generated target mutation.

- **Reactions — single follow-on (`emit Event { field: expr }` payloads).** An
  emitted event can carry explicitly-declared payload fields computed at emit
  time, so a follow-on reaction reading `payload.<field>` resolves real values
  instead of `undefined`. Closes the gap consumers papered over with hand-written
  after-emit middleware.

### Fixed

- **Package builds handle the new aggregate expression kind.** The `IRExpression`
  `aggregate` member added a case the MCP server's `explain` expression formatter
  missed (it is not covered by `tsconfig.app.json`'s typecheck — only by the
  `build:lib` / per-package builds that run at publish time), failing
  `prepublishOnly` during the 2.13.0 release attempt.

## [2.13.0] - 2026-06-17

_Tagged but not published — the release workflow's publish step failed on the MCP
build error above; nothing reached the registry. Superseded by 2.14.0 (same
content, build fixed)._

## [2.12.0] - 2026-06-17

_Auto-generated stub — expand with real release notes._

## [2.11.0] - 2026-06-17

### Added

- **Convex projection — generated reads now cover every schema index, including
  composites and the events table.** The `convex.queries` surface previously
  emitted `list<Entity>By<Field>` only for the single-column indexes it derived
  on its own, which diverged from the schema surface. Reads are now derived
  from the same index set the schema emits: multi-field `options.indexes`
  entries produce `list<Entity>By<A>And<B>` (a multi-arg `.eq` chain over
  `.withIndex`), and the system events table gains `listEventsByType` /
  `listEventsByEntity` / `listEventsByEntityId` alongside `listRecentEvents`.

- **Convex projection — tenant-scoped, soft-delete-filtered reads by default.**
  Generated `list<Entity>` / `get<Entity>` previously returned every row across
  all tenants and never excluded soft-deleted rows — the read-isolation gap the
  Convex design spec flagged as "filterable" but never implemented (the Next.js
  projection already filtered). Both filters are field-aware (a clause is
  emitted only when the entity declares the column) and on by default. The
  tenant id is read from the authenticated identity (`ctx.auth.<tenantProp>`),
  never from a client argument, so an un-scoped `list<Entity>()` fails closed
  (no auth wired → no rows) rather than leaking across tenants; `get<Entity>`
  returns `null` on a tenant mismatch or a soft-deleted row. New options:
  `includeTenantFilter`, `includeSoftDeleteFilter`, `tenantIdProperty`,
  `deletedAtProperty`.

### Fixed

- **Convex projection — schema↔query index parity.** The schema surface emits a
  `by_<fk>` index for every `belongsTo` / `ref` relationship regardless of
  `referenceMode`, but the query surface derived its foreign-key fields from a
  helper that returns nothing in `stringId` mode — so a `stringId` build (e.g.
  `EventProfitability.eventId`) shipped a `by_eventId` schema index with no
  matching `listEventProfitabilityByEventId` read. The two surfaces now derive
  index fields from one shared helper, so they can no longer disagree.

## [2.10.7] - 2026-06-16

### Fixed

- **Convex projection — generated mutations now pass `convex dev`'s typecheck
  end to end.** Two residual mismatches against Convex's generated dataModel
  remained after 2.10.6: a guard comparing an enum-typed argument to a
  non-member string literal (e.g. `args.status === ""`), and reaction `patch`
  calls whose target id rendered as a plain string rather than a Convex `Id`.
  The create-mutation handler now types its `args` loosely (consistent with the
  already structurally-typed `doc`), and reaction `patch` targets are cast at
  the db boundary. Verified against a 212-entity / 1054-command program: the
  generated backend typechecks with zero errors.

## [2.10.6] - 2026-06-16

### Fixed

- **Convex projection — numeric types now match runtime semantics.** `int`,
  `bigint`, `decimal`, and `money` mapped to `v.int64()` / `v.string()`, but the
  Manifest reference runtime treats every numeric type as an ordinary JS number
  (precision/scale and integer width are projection metadata, not runtime-
  enforced). The divergence broke generated guard/mutation arithmetic at
  runtime: `bigint + number` throws, and string-transported money concatenates
  on `+` and compares lexically. All numeric types now map to `v.number()`;
  per-property `typeMappings` can opt back into `v.int64()` / `v.string()` where
  lossless transport is genuinely required.

- **Convex projection — `= null` clears no longer rejected; null comparisons
  match absent fields.** A DSL `= null` clear (restore/reopen) rendered as
  `{ field: null }`, which Convex rejects for a `v.optional(T)` column. A
  literal-null assignment to a non-nullable field now lowers to `undefined`
  (Convex unsets it); nullable fields keep a real null. Guard `== null` /
  `!= null` now use loose equality so they match both null and an unset
  (`undefined`) field, and narrow `T | undefined` in the generated TypeScript.

- **Convex projection — consistent db-boundary casts.** The create insert
  already cast its structurally-built doc; the non-create patch, fetched doc,
  and reaction insert/patch were left strict, producing the bulk of the
  projection's type errors against Convex's generated dataModel (enum-union
  assignment, possibly-undefined access, status no-overlap). All db boundaries
  are now consistent (fetched doc typed `Record<string, any>`, payloads cast
  `as any`). Runtime behavior is unchanged; this only stops `convex dev`'s tsc
  gate from failing on generated standalone mutation code.

### Changed

- **`cut-release` workflow derives the release version from the latest git
  tag.** The bump base is now the latest `vX.Y.Z` tag rather than
  `package.json`, so a stale local `package.json` (a clone that did not pull a
  prior `[release]` commit) can no longer cause a wrong bump or a version
  collision.

## [2.10.5] - 2026-06-15

### Fixed

- **Convex reactions — payload now matches the reference-runtime contract.**
  Reaction `resolve`/`param` expressions resolve `payload` against the binding
  the reference runtime builds (`runtime-engine.ts`): the emitted event payload
  is `{ ...input, result }`, and reactions additionally see `_subject` (the
  canonical `{ entity, command, id }` metadata). The Convex projection bound
  only `{ _id, ...doc }`, so conformant IR expressions like `payload.result.id`
  or `payload._subject.id` read through `undefined` and crashed the reaction at
  runtime. Generated mutations now bind `result` (the affected entity, with its
  app-level `id` aliased to the Convex `_id`, since convexId mode stores no `id`
  scalar) and `_subject`, on both create and non-create mutations. No IR or
  `.manifest` change is required.

- **Convex command params — `array<T>` no longer collapses to `v.any()`.**
  Array-typed command parameters were validated as `v.any()` (entity *fields*
  already got `v.array(...)`, but the parameter path did not), losing element
  typing on the generated mutation arg. Array params now map to
  `v.array(<element>)`, mirroring the field path. Unknown leaf types still fall
  back to `v.any()` (params are not schema fields, so an unmapped type stays
  permissive rather than a hard diagnostic).

## [2.10.4] - 2026-06-15

### Fixed

- **Convex create mutations — defaults now match the field's validator type.**
  `int`/`bigint` map to `v.int64()` (a JS `bigint`) and `decimal`/`money` map to
  `v.string()` (lossless decimal transport), but the create-mutation default
  fill rendered IR `number` defaults structurally — e.g. `guestCount` defaulting
  to `1` (a JS number) where the schema validator expects a `bigint`, or a
  `money` field defaulting to `0` where it expects a string. Convex rejected
  these at insert time. The default renderer is now validator-aware: it emits
  `1n` for `v.int64()` fields and a quoted string for `v.string()` fields, and
  propagates the coercion through `v.array(...)` (an `array<int>` default
  `[2, 4]` → `[2n, 4n]`). Detection is structural, so per-property `typeMappings`
  overrides are honored. A non-integer default on an integer field is left
  un-coerced so the type mismatch surfaces rather than being silently truncated.

## [2.10.3] - 2026-06-15

### Added

- **Convex reactions — automatic tenant propagation.** A reaction fires within
  its source entity's tenant, so when it creates a tenant-scoped target entity
  the projection now threads the source `tenantId` (available as
  `payload.<tenantProp>`) into the generated insert, unless an explicit reaction
  param already sets it. This lets reactions fully populate tenant-scoped tables
  (e.g. the auto-created battle board / prep list) without the tenant value
  having to be authored into every reaction. Non-tenant-scoped targets are
  unaffected.

### Fixed

- **Convex schema — system events table name collision.** The default events
  table was `"events"`, which collides with the table of an entity named
  `Event` (both become the `events` `defineSchema` key, silently clobbering the
  entity table). The default is now `"manifestEvents"`, and the resolved name is
  deterministically suffixed (with a `CONVEX_EVENTS_TABLE_COLLISION` diagnostic)
  if a configured name still collides with an entity table. Schema and functions
  generators resolve the name through one shared helper so they always agree.

### Added

- **Convex `convex.mutations` — `policyMode` option.** New option
  (`'enforce'` | `'skip'`, default `'enforce'`). `'skip'` omits the
  authorization-policy (role / `checkRole`) checks from generated mutations
  while still enforcing guards and constraints — for dev/demo backends that have
  no auth context configured, so they no longer require hand-editing the
  generated files. When skipped, the `ROLE_PERMISSIONS` map and `checkRole`
  helper are not emitted (no dead code). Production builds keep the default
  `'enforce'`. The helper emission is now usage-driven in all modes.

## [2.10.1] - 2026-06-15

### Fixed

- **Convex `convex.mutations` — create-mutation field completeness.** Running the
  generated backend (`npx convex dev`) revealed that create mutations exposed
  only the command *parameters* as args, so required entity fields with neither a
  parameter nor a default (e.g. `tenantId`, `eventDate`, `eventType`) could never
  be provided and `ctx.db.insert` failed schema validation. The create model is
  now completeness-guaranteeing: every stored field is reachable — set by a
  `mutate` action, filled from its default (`args.x ?? default`, undefined-safe),
  or exposed as a mutation argument (required when required-and-no-default, else
  optional). Command parameters that feed actions remain exposed.

### Added

- **Convex `convex.queries` — `listRecentEvents`.** A convenience query returning
  the 50 most recent rows from the system events table (emitted when
  `emitEventsTable` is on).

### Added

- **Convex projection — functions & orchestration surfaces.** Builds on the
  `convex.schema` surface (2.9.0) with five new surfaces, completing the
  Manifest → Convex projection. All emit standalone, self-contained Convex code
  (no runtime dependency) and typecheck against `convex@1.41`.
  - **`convex.queries`** — reactive reads: `list<E>`, `get<E>`, and
    `list<E>By<Field>` over `.withIndex`, with FK arguments typed `v.id`.
  - **`convex.mutations`** — one governed `mutation` per IR command. Governance
    is rendered inline and **fail-closed**: each command runs its policies →
    guards → constraints (runtime order) via a pure IR-expression → TypeScript
    resolver; any expression the resolver cannot map emits a hard
    `CONVEX_UNRESOLVED_{POLICY,GUARD,CONSTRAINT}` diagnostic and a denying
    `throw`, never a silent pass. Roles become a `ROLE_PERMISSIONS` map +
    `checkRole()` (with `all` wildcard); `roleAllows(user.role, X)` →
    `checkRole(userRole, X)`. `create` commands source args from the command
    parameters and map them to stored fields via the `mutate` actions. Each
    mutation appends an event row and fires matched reactions (create-target →
    insert; other → resolve + patch). The schema surface now emits a system
    `events` table by default (`emitEventsTable` / `eventsTable` options).
  - **`convex.crons`** — IR schedules → `cronJobs()` (`crons.cron` /
    `crons.interval`) referencing the command mutations.
  - **`convex.http`** — IR webhooks → `httpRouter` / `httpAction` routes that
    read the request body, map `transform` params, and `ctx.runMutation` the
    command.
  - **`convex.sagas`** — IR sagas → orchestrator `action`s that run each step via
    `ctx.runMutation`, tracking completed steps and compensating in reverse on
    failure (`onFailure: compensate`) or rethrowing (`abort`).

  The expression resolver was measured at 100% coverage of capsule's 2545 real
  governance expressions; 843 queries + 1043 mutations + 2 saga orchestrators
  generated from the merged IR with zero type errors against real Convex.

## [2.9.0] - 2026-06-15

### Added

- **Convex schema projection (`convex.schema`).** New built-in projection
  (`src/manifest/projections/convex/`) that emits a `convex/schema.ts` artifact
  (`defineSchema`/`defineTable` + `convex/values` validators) from IR. Registered
  in the projection registry and exported at `@angriff36/manifest/projections/convex`.
  Highlights:
  - **Lossless numerics** — `int`/`bigint` → `v.int64()`, `decimal`/`money` →
    `v.string()` (no float rounding); `float` → `v.number()`. Bare `number` is a
    hard `CONVEX_AMBIGUOUS_NUMBER` diagnostic, unknown types a hard
    `CONVEX_UNKNOWN_TYPE` (no silent fallback), mirroring the Prisma projection.
  - **Typed references** — `belongsTo`/`ref` emit `v.id("<targetTable>")`, and a
    property that *backs* a relationship is retyped to the reference rather than
    its declared scalar. `referenceMode: 'stringId'` opts out for app-level ids.
  - Enums → `v.union(v.literal(...))`; `array<T>` → `v.array(...)`; nullable →
    union with `v.null()`; non-required → `v.optional(...)`.
  - `computed` properties are never emitted; the IR `id` is dropped (Convex's
    document `_id` is identity); referential actions emit a deferred-info
    diagnostic (cascades belong to the future functions surface).
  - Indexes for `indexed` properties, the tenant column, and every reference;
    composite/named indexes via the `indexes` option. Convex-idiomatic camelCase
    + pluralized table names by default, overridable via `tableMappings`/`naming`.
  - Options bag (`ConvexProjectionOptions`): `output`, `tableMappings`,
    `typeMappings`, `indexes`, `references`, `referenceMode`, `naming`.

  Validated against a 199-entity merged IR (zero error diagnostics); the emitted
  `convex/schema.ts` typechecks against `convex@1.41` with `--strict`. This is
  Phase 1; governed functions (queries/mutations) and schedules are roadmapped.

## [2.8.0] - 2026-06-15

### Changed

- **Custom (capability-style) role permission actions.** `IRRolePermission.action`
  was constrained to the enum `read|write|delete|execute|all`, so roles modelling
  capability-based RBAC (e.g. `allow salesAccess`, `allow financeAccess`) failed
  `manifest validate` / `validate-ai` / `doctor` even though the parser, IR
  compiler, and runtime already handle them as opaque permission tokens
  (`all` remains the wildcard; command-execution RBAC still checks `execute`/`all`).
  The IR schema now accepts any identifier action (`^[A-Za-z_][A-Za-z0-9_]*$`),
  and the `RolePermissionAction` / `IRRolePermissionAction` types are widened to
  `… | (string & {})` to keep autocomplete for the well-known values. The five
  conventional actions are unchanged. Non-identifier actions are still rejected.

## [2.7.0] - 2026-06-15

### Added

- **Status-based soft-delete for `GenericPrismaStore` (D27).** The generic store
  previously soft-deleted only via a `deletedAt` timestamp column, so entities
  that mark deletion by transitioning a status field (e.g. `status='deleted'`)
  needed a bespoke store class. New opt-in per-entity prisma-store projection
  option `softDelete: { field, deletedValue }` emits `softDeleteStatus` into the
  store metadata; `delete()` then transitions the status column (no timestamp, no
  hard delete) and reads exclude rows already at that value. Independent of and
  taking precedence over the `deletedAt` path. Default behavior unchanged.

## [2.6.0] - 2026-06-15

### Added

- **Cross-file entity composition (U4).** `compileProjectToIR` now resolves
  `extends`/`mixin` bases declared in a different file of the same compile unit.
  A project-wide composition index is built before per-file compilation and
  threaded into each file; local entities take precedence, each file still emits
  only its own entities, and cross-file duplicates/unknown bases are still
  diagnosed. This lets multi-file projects DRY shared infra fields into a base
  mixin instead of re-declaring them per entity.
- **Configurable governed-write receiver (U13).** The `direct-writes` and
  `unregistered-entity-write` detectors now accept `writeReceiver` on
  `DetectorContext` (default `prisma`), surfaced as `--write-receiver <name>` on
  `enforce-surface` and `audit-governance`. Consumers that re-export their ORM
  client under another name (e.g. `database.user.create`) get governed-write
  detection without forking the detector.
- **react-query projection options (D23).** Four data-driven options, each
  defaulting to the previous output: `entityRoutes` (per-entity read/write route
  bases with original casing), `readEnvelope` (per-entity list/detail/fallback
  keys, fixing irregular plurals), `fetchAdapter` (import a host `apiFetch` for
  auth/credentials instead of the inline helper), and `commandEnvelope` (type
  mutations as `CommandEnvelope<T>` = `{ success, result, events }`).

### Notes

- All changes are backward-compatible: defaults reproduce prior behavior
  byte-for-byte. Full suite green (2992 passed); typecheck and lint clean.

## [2.5.1] - 2026-06-15

### Changed

- [chore] 2.5.x dev batch: cycle-check tooling + CLI/LSP/store/projection refinements
- [feat] prisma projection: emit enum blocks + type enum-valued columns (D22)

## [2.5.0] - 2026-06-14

### Changed

- [feat] explicit event payloads: emit Event { field: expr } (G7)
- [fix] reject computed-property references in guards/constraints (G8)
- [feat] complete public projection export surface + add public mergeIR (D25, D12)
- [fix] multi-compiler: mergeIRs preserves sagas, webhooks, and schedules
- [fix] expose PrismaStoreProjection via listBuiltinProjections + index re-export
- [fix] GenericPrismaStore: soft-delete writes the resolved deleted_at column, not a hardcoded one
- [fix] diagnose parsed-but-unlowered top-level constructs instead of dropping them silently

## [2.4.2] - 2026-06-12

### Changed

- [chore] sync packages/cli/dist with committed src
- [fix] GenericPrismaStore: requiresTenantConnect connect-mode + snake_case tenant/deleted_at column resolution

## [2.4.1] - 2026-06-10

Downstream integration wave: Prisma store projection, runtime profiling,
schedule cron routes, debug tracing, and CLI fixes for multi-file compile and
REPL registration.

### Added

- **Prisma store projection** — `prisma-store.metadata` and
  `prisma-store.registry` surfaces plus `GenericPrismaStore` runtime at
  `@angriff36/manifest/stores/prisma-generic`. Config schema adds
  `projections.prisma-store` with `accessorNames` and output path hints.
- **Runtime profiling** — `RuntimeEngine.getProfiles()` returns real phase
  timings (policy, constraint, guard, approval, autoCreate, action,
  eventEmission) when `profiling` options are enabled.
- **Next.js schedule cron** — `nextjs.schedule` surface emits cron route
  handlers for IR `schedules` declarations.
- **Debug export** — `@angriff36/manifest/debug` with `CommandTraceRecorder`
  and `actionTraceHook` on `RuntimeOptions` for per-action snapshots.
- **REPL CLI** — `manifest repl` registered in the CLI command table.

### Fixed

- **Multi-file compile** — when multiple `.manifest` sources target a single
  `.json` output, the CLI auto-redirects to merged compilation instead of
  last-file-wins overwrite.
- **`COMPILER_VERSION`** — synced to `2.4.0` (was stale at `2.3.1`).

### Notes

- v2.4 contextual keywords (`mixin`, `schedule`, `retry`, `rateLimit`, `cron`,
  etc.) remain lexer identifiers, not global reserved words, so property names
  like `property schedule: string` continue to parse.

## [2.4.0] - 2026-06-10

Language and projection wave: entity composition, scheduled commands, command
retry, rate limiting, projection registry completeness, and Next.js naming
overrides. All new syntax is opt-in; execution semantics remain strict
(rate-limit → policies → constraints → guards → actions → emits).

### Added

- **Entity composition** — `extends` inheritance and `mixin` composition with
  compile-time merge (properties, relationships, constraints, policies, command
  names). Precedence: own > later mixin > earlier mixin > parent. Unknown
  parents and inheritance cycles are compile errors. Conformance fixtures
  77–81.
- **Scheduled commands** — `schedule` declarations with `cron`, `interval`, and
  `every` triggers; IR `schedules` array; runtime `getSchedules()` and
  `runSchedule(name)` (no built-in timer). Conformance fixture 76.
- **Command retry** — `retry { }` blocks on commands with `fixed`/`linear`/
  `exponential` backoff, optional jitter, and `retryOn` error codes. Runtime
  retries only retryable outcomes (`CONCURRENCY_CONFLICT`, `TIMEOUT` by
  default). Conformance fixture 72.
- **Rate limiting** — `rateLimit { }` on commands and policies with
  `user`/`tenant`/`global` scope and sliding-window enforcement before policy
  evaluation. Conformance fixtures 74–75.
- **Next.js projection naming overrides** — `naming`, `accessorNames`, and
  `routeSegments` options for DB accessor and route segment customization.
- **Projection registry** — Kysely, DynamoDB, Pydantic, and Dart projections
  registered in the default registry.
- **`generate-tests` CLI** — `manifest generate-tests` (alias `gen-tests`)
  registered in the CLI command table.
- **`compilerVersion` in IR provenance** — derived from package version and
  normalized in conformance output.

### Changed

- Next.js projection defaults to minimal output unless explicitly configured.
- IR schema aligned with `IRRetry.delayMs`, `IRRateLimit.burstAllowance`, and
  `IRSchedule.entityName`/`commandName` field names.

## [2.3.1] - 2026-06-10

Republish of 2.3.0. The 2.3.0 version on GitHub Packages is broken — its
metadata exists but the tarball returns 404, so installs fail with
`ERR_PNPM_FETCH_404`. No code changes; see 2.3.0 below for what shipped.
Consumers should skip 2.3.0 and install 2.3.1.

## [2.3.0] - 2026-06-09

Date/time primitive types with write-time validation, read-time property
masking, realtime entities with SSE surfaces in the Next.js projection, and
packaging fixes that make the published package install-and-go. No breaking
changes — all new syntax is opt-in.

### Added

- **Date/time primitive types** — `date`, `time`, and `datetime` property
  types with pure UTC-only validation and conversion builtins. Invalid values
  are rejected at write time with blocking `E_TYPE_*` outcomes. Type mappings
  added for the TypeScript generators, Prisma, Zod, and JSON Schema
  projections. Conformance fixture 92.
- **Property masking** — contextual `masked` modifier (with optional
  strategy arguments, e.g. `masked(redact)`) and `unmask when <expr>` clause.
  Masking is applied at read time in `getInstance`/`getAllInstances`; the IR
  carries `maskStrategy` with a compiler-enforced invariant (`masked` ∈
  modifiers ⇔ `maskStrategy` present). Conformance fixture 93.
- **Realtime entities** — contextual `realtime` entity flag (parser, AST, IR,
  schema) plus `runtime.subscribe(entityName, listener)` built on `onEvent`.
  The Next.js projection emits SSE surfaces for realtime entities: a
  `subscribe` route, a client subscription hook, and a module-scoped shared
  runtime accessor so subscriptions observe command events.

### Fixed

- **Packaging** — published package is now install-and-go: missing runtime
  dependencies declared, package exports corrected, and ESM import
  specifiers fixed.
- Reserved `hasPermission`/`roleAllows` and the date/time builtin names in
  the plugin API so plugins cannot shadow spec-guaranteed builtins.
- Deflaked projection registration tests via static registry import.

## [2.2.0] - 2026-06-03

A new opt-in identifier-casing convention for the Prisma projection, plus the
public typed config surface (`@angriff36/manifest/config`). No breaking changes —
the `naming` option is default-off, so existing projections emit identical
output.

### Added

- **Prisma auto-casing `naming` convention** — Standardize database identifier
  casing without hand-writing a `columnMappings`/`tableMappings` entry per field.
  Set `naming: 'snake_case'` (shorthand for
  `{ table: 'snake_case', column: 'snake_case', pluralizeTables: true }`) or the
  object form on the Prisma projection. `createdAt` emits `@map("created_at")`,
  `Widget` emits `@@map("widgets")`. The convention **only adds `@map`/`@@map`** —
  Prisma model names and field identifiers stay the IR name, so relation
  `fields`/`references`, `@@id`, `@@unique`, and `@@index` are unaffected, and a
  map is emitted only when the physical name differs. Resolution order: explicit
  `tableMappings`/`columnMappings` win → convention → IR name verbatim. See
  `src/manifest/projections/prisma/options.ts` and the new deterministic util
  `src/manifest/projections/shared/naming.ts` (snake/camel/pascal + pluralizer,
  no new dependency).
- **Global `naming` default with per-projection override** — A top-level
  `naming` in `manifest.config.yaml` is inherited by projections that map IR
  names to physical names; a per-projection `projections.<name>.options.naming`
  overrides it. Merge contract: `resolveProjectionOptions()` in
  `src/manifest/config.ts`. Both JSON config schemas accept `naming`, and
  `manifest config validate` enforces the allowed case values.
- **`@angriff36/manifest/config` package export** — Public typed config surface
  (`defineConfig`, `ManifestRuntimeConfig`, `ManifestBuildConfig`) for authoring
  a `manifest.config.ts` with editor autocomplete and compile-time checking.

## [2.1.0] - 2026-06-02

Three runtime defects that made advertised orchestration features silently fail
for downstream consumers (sagas, reactions, approvals) are fixed, plus a new
durable approval-persistence adapter family. No breaking API changes — the one
new `SagaStepResult.status` value and the widened `approveStage` approver
parameter are backward compatible.

### Fixed

- **Saga compensation passed empty input (data-loss / silent no-op)** — When a
  saga step failed and the engine compensated completed steps in reverse, each
  compensation command was invoked with `{}`. Any compensation needing the
  original step's payload (e.g. a refund needing the charge amount) got nothing,
  failed its guard, had the failure swallowed, and was still mislabeled
  `compensated`. The compensation now receives the **original forward step's
  input**, and a compensation that fails its guard/policy or throws is reported
  as the new status `compensation_failed` instead of `compensated`. See
  `src/manifest/runtime-engine.ts` (`compensateSagaSteps`) and
  `runtime-saga.test.ts`.
- **`on <Event> run <Entity>.create` reactions were a silent no-op** — Reaction
  dispatch always set `instanceId`, but auto-create only fires when `instanceId`
  is absent, so create-target reactions ran mutate actions against a
  non-existent instance and persisted nothing. Create-target reactions now route
  through the auto-create path (the resolved value becomes the new instance's
  `id`). The marketed "EventCreated → create Proposal/Budget/Tasks" fan-out works.
  See `runtime-engine.ts` reaction dispatch and `runtime-engine.test.ts`.
- **Approvals were in-memory only, with a role-as-userId hack** — Multi-stage
  approvals could not persist across requests (state lived in a private
  in-process `Map`), and stage policies were evaluated with the approver's userId
  doubling as their role, so real RBAC policies could not be expressed. Both are
  fixed (see Added).

### Added

- **`RuntimeOptions.approvalStore`** — a durable `ApprovalStore` adapter
  (`load`/`save`/`list`/`expire`) used as the backing store for pending approval
  requests when provided, falling back to the in-process Map otherwise. An
  approval created by one engine instance is now visible and approvable by a
  freshly-constructed engine bound to the same store (the normal
  stateless-per-request pattern). Ships first-party `MemoryApprovalStore`
  (`@angriff36/manifest/approval/memory`) and `PostgresApprovalStore`
  (`@angriff36/manifest/approval/postgres`), mirroring the audit/outbox adapter
  families. Contract exported as `ApprovalStore` from the package root.
- **Real approver role context for `approveStage`** — `approveStage(…, approver)`
  now accepts `{ id, role?, roles?, … }` in addition to the legacy `string`. The
  object is exposed to the stage policy as `user.*`, so policies like
  `user.role == "manager"` evaluate against the approver's actual role rather
  than their id. Passing a string keeps the prior (userId-doubles-as-role)
  behavior, so existing callers are unaffected.

### Behavior changes (non-breaking, worth noting)

- `SagaStepResult.status` gained the value `compensation_failed`. Consumers that
  exhaustively switch on saga step status should add a case; a failed
  compensation that previously surfaced (incorrectly) as `compensated` now
  surfaces as `compensation_failed`.

## [2.0.6] - 2026-06-02

### Fixed

- **Property-based test stability** — Added `noDefaultInfinity: true` to float generators in `runtime-expression-properties.test.ts` to prevent subnormal float edge cases causing non-deterministic CI failures

## [2.0.5] - 2026-06-02

### Fixed

- **Publish pipeline** — Simplified `prepublishOnly` to remove WASM build (requires `asc` not available in CI) and unpublished MCP/LSP server builds

## [2.0.4] - 2026-06-02

### Fixed

- **`replace()` builtin** — Use function-based replacement to avoid `$$` special pattern interpretation in `String.replace()`. `replace("hello", "l", "$$")` now correctly returns `"he$$$$o"` instead of `"he$o"`.

## [2.0.3] - 2026-06-02

### Fixed

- **Dart projection** — Removed unused `_irValueToDartLiteral` function and `IRValue` import causing TS6133/TS6196 typecheck failure

## [2.0.2] - 2026-06-02

### Fixed

- **CLI build errors** — Fixed TypeScript errors in `gen-tests.ts`, `load-test.ts`, `profile.ts`, and `validate-ai.ts` that blocked the release pipeline
- **Dart projection** — Removed unused `@ts-expect-error` directive causing TS2578

## [2.0.0] - 2026-06-02

76 new features across 5 themed groups. This is the largest Manifest release to date, adding 16 new projection targets, 4 store adapters, entity inheritance/generics, distributed workflow primitives, a full AI integration surface, and comprehensive developer tooling.

### Language & Type System

- **Expanded Date/Time types** — `date`, `time`, `datetime`, `duration` primitives with ISO 8601 semantics
- **Map / Record type** — `map<V>` for key-value property types
- **Entity inheritance** — `entity Child extends Parent { ... }` and `mixin` composition with cycle/unknown-parent detection
- **Generic / parameterized entities** — `entity Paginated<T> { ... }` with compile-time instantiation and type substitution
- **Command retry policy** — declarative retry with backoff, max attempts, and retryable error matching
- **Rate limiting** — per-command rate limit declarations with sliding window and bucket algorithms
- **Scheduled / cron commands** — `schedule "cron expression" run Entity.command` triggers
- **Field-level encryption** — `encrypted` property modifier with adapter-driven encrypt/decrypt
- **Full-text search** — `fulltext` index declarations with language-aware tokenization config
- **Webhook triggers** — inbound `webhook` declarations parsing HTTP payloads into commands
- **Data masking** — `masked` property modifier with role-based unmasking policies
- **Expression language extensions** — string interpolation, ternary, null coalescing, array comprehensions
- **Standard library (stdlib)** — curated set of reusable Manifest modules (validation, formatting, etc.)
- **Custom expression functions** — plugin API for registering user-defined builtins at runtime
- **Event sourcing store** — append-only event store adapter with snapshot + replay

### Projections & SDK Generation

- **OpenAPI 3.1 projection** — generates OpenAPI specs with schemas, security, and operation IDs from IR
- **JSON Schema projection** — Draft-07 JSON Schema from entity/property definitions
- **Zod schema projection** — Zod validation schemas with constraint-aware refinements
- **TanStack Query hooks** — React Query / Vue Query hook generation for entity CRUD
- **Remix projection** — Remix / React Router v7 route and loader generation
- **SvelteKit projection** — SvelteKit server routes and type-safe stores
- **Flutter / Dart projection** — Dart model classes with JSON serialization
- **Python Pydantic projection** — Pydantic v2 model generation with validators
- **Terraform projection** — Infrastructure-as-Code from store/entity declarations
- **Kysely projection** — Type-safe SQL query builder types from IR entities
- **Materialized view projection** — SQL materialized view DDL for PostgreSQL
- **Analytics projection** — Event schema generation for analytics platforms
- **Elasticsearch / OpenSearch projection** — Index mappings and ingest pipelines
- **Python SDK generation** — Full Python client SDK with type hints and async support
- **Storybook projection** — CSF3 stories with guard pass/fail and constraint interaction stories
- **Hono edge projection** — Hono edge-runtime handler generation

### Runtime, Stores & Infrastructure

- **DynamoDB store adapter** — Full DynamoDB store with outbox pattern support
- **Redis store adapter** — Redis-backed store with pub/sub event emission
- **Turso / libSQL store adapter** — libSQL-compatible store with WAL mode
- **Transactional outbox** — Atomic state + event commit pattern with PostgreSQL and DynamoDB implementations
- **Runtime middleware** — Before/after middleware pipeline for command execution hooks
- **Interactive REPL** — `manifest repl` for live Manifest expression and command evaluation
- **Time-travel debugger** — Runtime state rewind/replay for debugging command sequences
- **Federated multi-service runtime** — Cross-service entity references and remote command dispatch
- **Saga orchestration** — Multi-step distributed workflow declarations with compensating actions
- **Real-time subscriptions** — WebSocket-based entity change subscriptions
- **Custom store adapter API** — Plugin-based store registration via `definePlugin`
- **Plugin API** — Third-party extension system for projections, stores, and builtins
- **Seed data generator** — Auto-generate seed data from IR entity/relationship definitions
- **Performance profiler** — Runtime command/constraint profiling with bottleneck detection

### Developer Tooling & AI Integration

- **AI Agent SDK** — Typed SDK (`@angriff36/manifest/agent-sdk`) wrapping runtime with LLM-friendly tool interfaces (Anthropic, OpenAI, Vercel AI compatible)
- **AI test generator** — AI-assisted conformance test generation from IR descriptions
- **LLM context export** — `llms.txt` and structured context for LLM consumption
- **LLM IR validator** — Validate and repair LLM-generated IR against the schema
- **MCP server** — Manifest Model Context Protocol server for AI tool integration
- **Code formatter** — `manifest fmt` with configurable indentation and style rules
- **Import system** — `use "./path.manifest"` cross-file references with module resolution
- **Online playground** — Shareable web playground with URL-encoded state
- **VS Code extension** — Syntax highlighting, diagnostics, and go-to-definition
- **Language Server Protocol** — Full LSP implementation with completion, hover, diagnostics
- **Watch mode compiler** — Incremental rebuild on file change with diagnostic streaming
- **IR version control** — IR version registry with changelog tracking and diff
- **IR compression** — Binary serialization for compact IR transport and storage
- **IR graph visualizer** — Entity relationship graph from IR with interactive exploration
- **Changelog from IR diff** — Automated changelog generation comparing two IR versions
- **Command coverage reporter** — Guard and constraint coverage analysis for commands
- **Documentation site generator** — Auto-generated API docs from IR entities and commands
- **Natural language transpiler** — `manifest generate --from-prompt "..."` with LLM-backed generation
- **Environment variable mapping** — `manifest preflight` validates env vars against config schema
- **Event subject metadata** — Canonical `event.subject` metadata on all emitted events
- **Health check export fix** — Corrected HealthCheckProjection package exports and registration
- **Health check ESM fix** — Fixed missing `.js` extension in ESM import paths

### Advanced Runtime & Platform

- **WebAssembly runtime** — WASM compilation target for browser/edge Manifest execution
- **Interactive tutorial mode** — Step-by-step guided tutorial in the diagnostic UI
- **Constraint test harness** — Interactive constraint validation testing surface
- **Policy matrix viewer** — Visual policy/action/role matrix display
- **Bundle size analyzer** — Generated code bundle size reporting and tree-shaking analysis
- **Load testing fixtures** — k6/Artillery load test generation from IR commands
- **Mock server** — Auto-generated mock server for testing without real stores
- **Snapshot testing** — Snapshot testing for generated projection code
- **Property-based testing** — Fast-check property-based tests for runtime engine

### Feature List & Release Tooling

- **Feature list document** — `docs/FEATURE-LIST.md` cataloging all 116 features with implementation details
- **Feature list generator** — `tools/gen_feature_list.py` for regenerating from automaker state

## [1.8.0] - 2026-06-01

### Added

- **Declarative event reactions** — `on <Event> run <Entity>.<command>` reaction rules with `resolve <expr>` instance resolution and `params { ... }` mapping. The runtime auto-dispatches the downstream command when the event is emitted, sequenced by declaration order and guarded against runaway cascades (`ManifestReactionDepthError`). Enables cross-entity orchestration (e.g. `OrderCompleted → Invoice.createFromOrder`) declaratively inside Manifest's governance boundary. Conformance fixture `67-event-reactions`.
- **Multi-stage approval workflows** — `approval` declarations gating a command behind ordered, multi-stage sign-off. Stages declare `policy:`, `required:`, and optional `when:`; plus `timeout:` / `on_timeout:` and lifecycle events. The approval gate runs after guards and before actions (policies → constraints → guards → approval → actions → emits). Conformance fixture `68-approval-workflow`.
- **Async / background command execution** — `async command` modifier defers actions to a background worker queue. Policies, constraints, and guards are validated synchronously (fail-fast); the command then enqueues a `JobRecord` and returns `{ jobId, status: 'pending', enqueuedAt }`. Auto-synthesizes `{Command}Completed` / `{Command}Failed` events. New `JobQueue` adapter (`MemoryJobQueue` for tests, `RuntimeOptions.jobQueue`, `drainJobs()`). Conformance fixture `69-async-commands`.
- **Role hierarchy & permission inheritance** — `role <Name> [extends <Parent>] { (allow|deny) <action> [<target>] }`. Effective permissions (root-first union minus absolute deny) are resolved at compile time for O(1) runtime checks, with duplicate / unknown-parent / cycle detection. New builtins `hasPermission(action, target?)` and `roleAllows(roleName, action, target?)`; deny is absolute and unknown roles default-deny. `role` remains a contextual identifier, so existing `property role` / `user.role` usages are unaffected. Conformance fixture `71-role-hierarchy`.
- **Multi-module compilation** — `use "./path.manifest"` imports with a module resolver (BFS discovery, DFS cycle detection, topological sort) and a multi-compiler that performs cross-file validation and deterministic IR merge. Optional `IRProvenance.sources`; CLI `--merge` / `--entry` flags; new package exports `./multi-compiler`, `./module-resolver`, `./parser`. Single-file compilation is unchanged.
- **Cross-entity constraint expressions** — constraints can now traverse relationships to arbitrary depth (e.g. `self.customer.status == "active"`) via `_entity` metadata on resolved relationship instances. Conformance fixture `70-cross-entity-constraints`.
- **Health-check projection** — new built-in projection generating a `/manifest/health` endpoint (`health.handler`, `health.nextjs`, `health.express` surfaces): IR provenance-hash integrity, per-store-target connectivity, and outbox queue-depth checks, with configurable HTTP status mapping (200 healthy / 503 unhealthy|degraded).
- **Storybook projection** — new built-in projection generating Storybook CSF3 stories and arg types from entities and commands, including `GuardsPass` / `GuardFails` interaction stories and constraint-violation stories.

### Fixed

- **Next.js projection read routes are now field-aware** — the generated Prisma `findMany` / `findFirst` queries only emit the soft-delete filter (`deletedAt: null`) when the entity actually declares that column, and the list `orderBy` uses `createdAt` only when present, falling back to the always-present `id`. Previously these clauses were emitted for every entity, producing queries Prisma rejects at runtime (`Unknown argument deletedAt`) for entities without those columns.

## [1.7.0] - 2026-05-31

### Added

- **First-class `create` command auto-instantiation** — `runCommand('create', body, { entityName })` now prepares a non-persisted create candidate, evaluates policies, command constraints, and guards against it, then persists through `Store.create`.
  - Uses `body.id` when present, otherwise falls back to `RuntimeOptions.generateId`.
  - Returns the created entity in both `result` and `newInstance` on the command result.
  - Event and outbox behavior preserved, including correct `event.subject.id` for the created entity.
  - Update-style commands (with `instanceId`) are unchanged.

### Changed

- Agent instruction files (`AGENTS.md`, `CLAUDE.md`) corrected to use `pnpm` instead of `npm` throughout, matching the actual pnpm workspace setup.

## [1.6.0] - 2026-05-30

### Added

- **Canonical `event.subject` metadata** — every event emitted during `runCommand` now carries a `subject` of `{ entity?, command, id? }`, so downstream consumers can identify the originating entity, command, and target instance without inferring identifiers from payload shape.
  - Deterministic id resolution order: `instanceId` → single created record id → top-level `payload.id` → unset (no fabricated ids).
  - `subject` is threaded intact through the outbox pipeline (memory + PostgreSQL stores).
  - Optional `PostgresOutboxStore` `projectSubject` flag projects `subject.entity` / `subject.id` into indexed `subject_entity` / `subject_id` columns for querying.
- Fully additive and backward-compatible: `subject` is optional on `EmittedEvent`; existing payloads and consumers are unaffected.

## [1.5.0] - 2026-05-29

### Added

- **plugin-api** — registration hooks for custom store adapters and custom expression functions.
- **Computed property memoization** — `cache request` / `session` / `ttl` modifiers on computed properties.
- **Conformance fixture** `65-computed-property-caching`.

## [1.4.0] - 2026-05-29

### Added

- **New CLI commands** — `manifest watch` (incremental recompile/reproject), `manifest diagram` (Mermaid export), `manifest coverage` (command/guard/policy/constraint coverage), `manifest changelog` (changelog from IR diffs).

## [1.3.0] - 2026-05-29

### Added

- **`matches(value, pattern)` regex constraint** — compile-time regex syntax validation plus runtime enforcement.
- **Aggregate expression builtins** — `sum`, `avg`, `min_of`, `max_of`, `count_of`, `filter`, `map` over collections, each accepting an optional mapper/predicate lambda; usable in computed properties.
- **`flag(name)` feature-flag builtin** — resolves feature flags via a runtime-provided provider in guards and policies (returns `false` when no provider is configured).
- **Conformance fixtures** `63-regex-constraints`, `64-aggregate-computed-properties`, `66-feature-flags`.

### Notes

- `66-feature-flags` ships an expected IR fixture but not yet a `results.json`; feature-flag runtime behavior is not yet locked by a conformance results fixture.

## [1.2.0] - 2026-05-29

### Added

- **JSON Schema projection** — JSON Schema output from IR entity definitions (`pattern`, `minimum`/`maximum`, `required`, `enum`).
- **Mermaid projection** — ER/diagram export from IR, available via the `manifest diagram` CLI command.
- **LLM context projection** — structured IR/domain-model export for AI agent context injection.

## [1.1.0] - 2026-05-29

### Added

- **Projection framework foundation** — shared projection registration plus the IR, parser, and runtime updates underpinning the new projection targets.
- **GraphQL projection** — SDL type definitions plus resolver stubs from IR entities, commands, policies, and events.
- **Hono projection** — route handlers for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy).
- **Express projection** — route handlers and middleware with typed request/response shapes.

## [1.0.32] - 2026-05-26

### Added

- **`manifest-mcp` bin** on `@angriff36/manifest` — official MCP server (`compile`, `execute`, `validate`, `explain` tools + IR schema/semantics resources) is now included in the published tarball.
- Runtime dependencies **`@modelcontextprotocol/sdk`** and **`zod`** required by the MCP server.

### Fixed

- **MCP packaging gap (since v1.0.25)** — `packages/mcp-server` existed in the repo but was excluded from `files` and never built during publish; consumers installing from GitHub Packages could not run `manifest-mcp`.
- **`manifest://semantics` resource** — ships `docs/spec/semantics.md` in the tarball.

## [1.0.31] - 2026-05-26

### Added

- **Drizzle ORM schema projection** — generates TypeScript-first Drizzle table definitions from IR with column types, PKs, FKs, indexes, unique constraints, relations API, referential actions, array types, and multi-dialect support (PostgreSQL, MySQL, SQLite).
- **`drizzle.schema` surface** and **`@angriff36/manifest/projections/drizzle`** package export.
- **51 unit tests** covering type mapping, relationships, indexes, defaults, and diagnostics.

### Fixed

- **v1.0.30 publish gap** — builtins registered `DrizzleProjection` but the drizzle source files were not included in the tarball; this release adds the missing implementation.

## [1.0.30] - 2026-05-26

### Added

- **Array / list property type** — runtime support for `array<T>` and `T[]` properties with `.contains()`, `.all()`, and `.any()` method calls; `getDefaultForType('array')` returns `[]`; conformance fixture `40-array-properties`.
- **IR version control** — `src/manifest/ir-version-store.ts` with semver tagging, integrity verification, and changelog generation; `manifest versions` CLI with 8 subcommands (list, show, save, diff, changelog, tag, rollback, verify); `@angriff36/manifest/ir-version-store` export; exported `computeIRHash` from ir-compiler.
- **Plugin API** — `@angriff36/manifest/plugin-api` and `@angriff36/manifest/plugin-loader` with five extension points (projections, stores, audit sinks, builtins, CLI commands); `manifest plugins list` CLI; `plugins` config section; `docs/spec/plugins/plugin.schema.json`.
- **106 new tests** (conformance + ir-version-store + versions CLI + plugin-api + plugin-loader).

## [1.0.27] - 2026-05-26

### Added

- **Zod schema projection** — generates `z.object()` validation schemas from IR entities and command parameters with constraint refinements, computed property extensions, and nullable/optional/default handling.
- **Three surfaces:** `zod.entity`, `zod.command`, `zod.schemas`.
- **`@angriff36/manifest/projections/zod`** package export.
- **41 unit tests** covering type mapping, constraints, determinism, and edge cases.

## [1.0.26] - 2026-05-26

### Added

- **`manifest fmt`** — deterministic whitespace formatter for `.manifest` source with `--check` and `--write` modes; verifies parse success before accepting output.
- **`manifest install-hooks`** — installs Husky or simple-git-hooks pre-commit hooks running `manifest fmt --check` and `manifest validate` on staged `.manifest` files.
- **`hooks` config section** in `manifest.config.yaml` — `skipInCi`, `provider`, `runFmt`, and `runValidate` options.
- **12 unit tests** for fmt and install-hooks commands.

## [1.0.25] - 2026-05-26

### Added

- **Manifest MCP server** (`packages/mcp-server`) — Model Context Protocol server with `compile`, `execute`, `validate`, and `explain` tools plus IR schema, cached IR, and semantics resources.
- **`manifest-mcp` CLI bin** for stdio MCP transport.
- **`pnpm-workspace.yaml`** for monorepo package discovery (`packages/*`).
- **17 unit tests** for MCP tool handlers.

## [1.0.24] - 2026-05-26

### Added

- **TanStack Query projection** — generates typed `useEntityList`, `useEntityDetail`, and command mutation hooks with query key factories and cache invalidation.
- **`ManifestQueryProvider`** component surface with configurable staleTime and error boundary integration.
- **`@angriff36/manifest/projections/react-query`** package export.
- **21 unit tests** covering hooks, mutations, provider, determinism, and edge cases.

## [1.0.23] - 2026-05-26

### Added

- **OpenAPI 3.1 projection** — generates complete OpenAPI specs from IR entities, commands, and routes with JSON Schema-typed bodies, security schemes, and constraint error responses.
- **`@angriff36/manifest/projections/openapi`** package export.
- **40 unit tests** covering entity read/command operations, type mapping, security, determinism, and edge cases.

## [1.0.22] - 2026-05-26

### Added

- **Range constraint primitives** — `min`, `max`, `between`, and `length` builtins for declarative numeric range and string length validation.
- **`constraint-analysis` module** — static analysis extracting numeric ranges and length bounds from IR constraints for projection use (SQL CHECK, Zod, OpenAPI).
- **22 unit tests** for constraint analysis converters and merge logic.
- **Conformance fixtures** `56-expression-builtins` (diagnostics/results) and `57-range-constraint-builtins` (IR compilation).

## [1.0.21] - 2026-05-26

### Added

- **`manifest migrate`** CLI command — IR diff analysis for database migration planning with `--dry-run`, `--preview`, `--force`, `--tool`, and reversibility checks.
- Integrates `@angriff36/manifest/ir-diff` and `@angriff36/manifest/breaking-change` for SQL/Prisma migration preview output.

## [1.0.20] - 2026-05-26

### Added

- **IR Graph Visualizer** — force-directed canvas panel in Kitchen/Runtime UI showing entities, relationships, event flows, and computed dependencies.
- **Graph tab** between AST and Docs with pan/zoom, click-to-inspect, SVG/PNG export, and legend overlay.
- **`IRGraphPanel`** component (`src/artifacts/IRGraphPanel.tsx`) with zero new dependencies.

## [1.0.19] - 2026-05-26

### Added

- **`manifest preflight`** CLI command — validates environment variables against `env` mapping in `manifest.config.yaml`; supports `--format json` and `--generate-example`.
- **`env` mapping schema** in `manifest.config.schema.json` with `stores`, `auth`, `adapters`, and `custom` categories.
- **TypeScript types** `EnvMapping` and `EnvVarDefinition` in CLI config utilities.
- **15 unit tests** for preflight validation and `.env.example` generation.

## [1.0.18] - 2026-05-26

### Added

- **`manifest docs`** CLI command — generates static HTML or Markdown documentation from IR (entity reference pages with properties, commands, policies, constraints, events).
- **16 unit tests** covering HTML/Markdown output, all IR sections, error handling, and directory input.

## [1.0.17] - 2026-05-26

### Added

- **`manifest init --ci github`** — generates `.github/workflows/manifest-ci.yml` with validate, scan, test matrix (Node 18/20/22), and conformance fixture regen on main.
- **CLI flags** `--node-versions` and `--force` for CI workflow generation.
- **12 unit tests** for workflow generation and file creation.

## [1.0.16] - 2026-05-26

### Added

- **`@angriff36/manifest/agent-sdk`** — LLM-friendly SDK wrapping the runtime engine: `AgentRuntime`, tool definitions (Anthropic/OpenAI/Vercel), IR introspection, intent mapping, and JSON Schema helpers.
- **60 unit tests** for agent-sdk (tool naming, introspection, intent scoring, tool call routing).

## [1.0.15] - 2026-05-26

### Added

- **Entity `timestamps` modifier** — auto-injects `createdAt`/`updatedAt` on IR compile; runtime populates on create/update.
- Conformance fixture **`62-timestamp-auto-fields.manifest`**.
- Prisma projection: `@default(now())` on `createdAt`, `@updatedAt` on `updatedAt` when entity has `timestamps: true`.
- IR schema: `values`, `tenant`, `timestamps` fields aligned with compiler/runtime.

## [1.0.14] - 2026-05-26

### Added

- **`tenant` declaration** — `tenant <prop> : <type> from <context.path>` compiles to IR `tenant`, auto-injects on writes, filters reads, and fails closed on commands without tenant context.
- Conformance fixture **`61-tenant-isolation.manifest`**.
- Prisma projection: auto tenant column, `@@index`, and RLS policy hints when IR declares tenant.

## [1.0.13] - 2026-05-26

### Added

- **`value` declarations** — reusable composite types embedded on entity properties (IR `values[]`, Prisma `Json` columns).
- Conformance fixture **`60-value-objects.manifest`**.

## [1.0.12] - 2026-05-26

### Added

- **`@angriff36/manifest/ir-diff`** — compare two IR JSON files; optional SQL/Prisma migration hints.
- **`@angriff36/manifest/breaking-change`** — classify IR diffs as compatible, deprecated, or breaking.
- **CLI** `manifest diff ir-vs-ir` and `manifest diff breaking` with `--json`, `--sql`, `--prisma`, `--ci`.

## [1.0.11] - 2026-05-26

### Added

- **`npm run test:postgres`** — runs live Postgres adapter tests when `DATABASE_URL` is set (Manifest Neon DB, direct connection).
- Vitest loads `.env`; live suites use `DATABASE_URL` (legacy `MANIFEST_POSTGRES_TEST_URL` still accepted).

### Fixed

- **`PostgresOutboxStore.claim`** returns entries in stable FIFO order (`enqueued_at`, then `entry_id`).

## [1.0.10] - 2026-05-26

### Added

- **`manifest validate-ai`** CLI command: compile `.manifest` or validate `.ir.json` with schema + semantic checks, 0–100 scoring, and machine-readable JSON output for agent self-correction loops.
- **CLI tests** for IR validation, semantic diagnostics, scoring, text/JSON output, and manifest-source compilation.

## [1.0.9] - 2026-05-26

### Added

- **Expression builtins** in the reference runtime: string (`trim`, `split`, `replace`, …), math (`abs`, `min`, `max`, `between`, …), array (`sum`), and UTC date extractors (`year`, `month`, …).
- **Conformance fixture `56-expression-builtins`** for executable semantics.
- **`docs/spec/builtins.md`** Expression Library section documenting required callables.

## [1.0.8] - 2026-05-26

### Added

- **`decimal` and `money` type keywords** in the lexer (reserved words).
- **`IRType.params`** in `ir-v1.schema.json` for `precision` and `scale` on exact-decimal types.
- **Conformance fixture `56-decimal-type`** covering `decimal(10, 2)`, `money(12, 4)`, bare `decimal`, and nullable `money?`.
- **Compiler unit test** asserting decimal/money params survive IR lowering.

### Notes

- Parser and `transformType` already supported `decimal(p, s)` before this release; 1.0.8 completes the contract (schema + keywords + executable semantics).

## [1.0.7] - 2026-05-26

### Fixed

- **Enum property defaults**: `property status: Status = draft` now lowers to `defaultValue: { kind: "string", value: "draft" }` in IR.
- **`IRModule.enums`** added to `ir-v1.schema.json` (required + properties), matching `ir.ts` and the compiler.

### Changed

- Conformance expected IR hashes refreshed after enum-default lowering.
- Fixture **`57-enum-type`** restored with `status` default.

## [1.0.6] - 2026-05-26

### Added

- **First-class `enum` declarations** with optional labels and ordinals.
- Top-level **`IR.enums`** array (schema, compiler, types); existing programs emit `enums: []`.
- **Conformance fixture `57-enum-type`** for enum syntax and enum-typed properties.
- **`enum` lexer keyword**.

### Fixed

- **CLI `compile` directory glob** uses the source directory as `cwd` (multi-file duplicate-command detection works in temp dirs).
- **`runtime-smoke` IR fixture** includes `enums: []` (CLI build/typecheck).
- **ESLint** ignores `.worktrees/**`.

### Changed

- Regenerated conformance expected IR for `enums: []` on programs without enum declarations.

## [1.0.5] - 2026-05-25

### Added

- Postfix array type syntax (`string[]` → `array<string>`).
- Prisma scalar list fields from Manifest array types.

### Fixed

- Duplicate command-intent guard retained from 1.0.4.
