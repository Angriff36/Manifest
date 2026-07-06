# Feature Status Matrix — irexplained.md wiring audit

Canonical reconciliation of the 13-group / 112-feature wiring audit (`wr1y9n649.output`).
Verifier corrections (2) applied and marked; corrected status WINS over tracer status.

- **wired** = every claimed layer exists and is tested end-to-end.
- **partial** = some layer missing (usually runtime enforcement or a subset of projections).
- **ir-only** = IR field exists but nothing downstream reads it. (No feature landed here; the two closest — `IRType.params` and entity-level constraint override fields — are recorded as `partial`.)
- **incorrect** = irexplained.md states something the code contradicts (wrong interface shape, wrong ordering, wrong output, unenforced "explicit" claim).

Counts: **wired 60 · partial 41 · incorrect 11 · ir-only 0 · total 112.**

---

## Status matrix

### Group: fidelity (interface transcription vs ir.ts)

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IRSchedule interface shape (§30) | incorrect | — | irexplained.md:1520-1524 vs ir.ts:287-297 | omits required `name`, `module?`, `entityName?` |
| IRApprovalStage interface shape (§14) | incorrect | — | irexplained.md:697-700 vs ir.ts:103-111 | omits required `name` |
| IRRole interface shape (§42) | incorrect | — | irexplained.md:2070-2076 vs ir.ts:479-488 | omits required `name`, `module?` |
| IRReactionRule interface shape (§28) | incorrect | — | irexplained.md:1405-1412 vs ir.ts:322-337 | omits `module?`, `entity?`; fanOut shown as ellipsis |
| IRSaga interface shape (§29) | incorrect | — | irexplained.md:1460-1464 vs ir.ts:357-365 | omits `module?`; also missing IRSagaStep.compensateEntity |
| IRWebhook interface shape (§31) | incorrect | — | irexplained.md:1570-1580 vs ir.ts:383-400 | omits `module?` |
| IRCommand interface shape (§34) | incorrect | — | irexplained.md:1713-1729 vs ir.ts:402-427 | omits `module?` |
| IRModule interface shape (§4) | partial | — | irexplained.md:178-188 vs ir.ts:65-78 | ellipsis hides reactions/sagas/roles/schedules/webhooks arrays |
| IRAggregate op union (§47) | wired | — | irexplained.md:2275-2320; ir.ts:516 | accurate (count-only) |
| foreignKey/through mutual-exclusion *claim* (§20) | wired | — | ir.ts:219,222 JSDoc | claim matches the JSDoc — but enforcement is absent (see keys-relations row) |
| BuiltinStoreTarget enum (§26) | wired | — | ir.ts:301 | exact match |
| IRAction kind union (§37) | wired | — | ir.ts:448 | exact match |
| RefAction union (§21) | wired | — | ir.ts:206 | exact match |
| MaskStrategyType union (§18) | wired | — | ir.ts:183 | exact match |
| PropertyModifier union (§16) | wired | — | ir.ts:181 | exact 9-value match |
| IRPolicy action union (§41) | wired | — | ir.ts:457 | exact match |
| IRTrigger kind union (§30) | wired | — | ir.ts:279 | exact match |
| IRRetry backoff union (§24) | wired | — | ir.ts:250 | exact match |
| IRExpression node-kind union (§46) | wired | — | ir.ts:505-516 | 11-kind exact match |

### Group: core-types

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IRProvenance.contentHash | wired | — | ir-compiler.ts:99; ir-compiler.test.ts:37,61 | none |
| IRProvenance.irHash | wired | — | ir-compiler.ts:603,606; test:72-77 | none |
| IRProvenance.compilerVersion | wired | — | version.ts:13; ir-compiler.ts:101; version.test.ts:15-20 | prior 1.0.0 hardcode resolved; no change |
| IRType.nullable | wired | — | ir-compiler.ts:1459; prisma/generator.ts:304 | none |
| IRType.generic | wired | — | ir-compiler.ts:1458; prisma/generator.ts:250 | none |
| IRType.params (precision/scale) | partial | projections | ir-compiler.ts:1460; prisma/generator.ts:346 uses options.precision NOT type.params | §44 must warn params is stranded |
| IRValue kinds (6) | wired | — | ir.ts:497-503; runtime-engine.ts:4345-4360 | none |
| IRExpression kinds literal…object (9) | wired | — | ir-compiler.ts:1464-1577; runtime-engine.ts:4094-4207 | none |
| IRExpression kind: lambda | partial | projections (Convex stubs) | runtime-engine.ts:4209-4217; convex/expression.ts:191-193 | §46 must note Convex can't transpile |
| IRExpression kind: aggregate (count) | wired | — | runtime-engine.ts:4219-4241; runtime-aggregate-count.test.ts:65-82 | §47 should note full-table-scan cost |
| IRDiagnostic / CompileToIRResult | wired | — | ir.ts:518-523,617-620; ir-compiler.ts:349-359 | none |

### Group: tenant-stores

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IR.tenant — syntax + compile | wired | — | parser.ts:79; ir-compiler.ts:551-586; tenant-isolation.test.ts:56 | none |
| IR.tenant — runtime read filter + write inject | wired | — | runtime-engine.ts:1878-1882,2055-2059,2381-2386 | none |
| IR.tenant — projection consumption | partial | Next.js/SvelteKit/Remix/Express/Hono don't read ir.tenant | prisma/generator.ts:990; nextjs/generator.ts:123-130 (options-driven) | §3 overclaims "projections generate tenant-aware code" |
| IRStore — memory | wired | — | runtime-engine.ts:1122-1124,690-729 | none |
| IRStore — localStorage | wired | — | runtime-engine.ts:1115-1120,730-800 | none |
| IRStore — postgres | partial | runtime does not auto-instantiate (storeProvider required) | runtime-engine.ts:1125-1130; stores.node.ts:39-187 | §26 note storeProvider requirement |
| IRStore — supabase | partial | runtime does not auto-instantiate | runtime-engine.ts:1131-1136; stores.node.ts:204-309 | §26 note storeProvider requirement |
| IRStore — durable | partial | not a lexer keyword; runtime intentionally throws | lexer.ts (absent); runtime-engine.ts:1143-1151 | §26 minor accuracy note |
| IRStore — mongodb | partial | not a lexer keyword; no auto-instantiate | runtime-engine.ts:1137-1142; stores.node.ts:335-455 | §26 minor accuracy note |
| IRStore — custom adapter scheme | wired | — | plugin-loader.ts:226-256; runtime-engine.ts:1101-1106 | §26 claim accurate |

### Group: entity-props

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| required modifier | partial | runtime validation | prisma/generator.ts:300-302 (dropped); runtime-engine.ts (no check) | §16 must state runtime does NOT enforce required |
| unique modifier | partial | runtime uniqueness | prisma/generator.ts:312; runtime-engine.ts (no dup check) | §16 "validation/form behavior" aspirational |
| indexed modifier | partial | Prisma/Drizzle emit no index; runtime none | convex/generator.ts:347; prisma/generator.ts (no @@index) | none (doc doesn't over-claim) |
| private modifier | partial | plain-private runtime filter; Prisma/Drizzle/Zod/OpenAPI | runtime-engine.ts:1951-1953 (only strips if also masked) | §16 must clarify plain private is NOT filtered |
| readonly modifier | partial | runtime write-block; most DB projections | openapi/generator.ts:247; runtime-engine.ts (no block) | none |
| optional modifier | partial | runtime; most projections use required-absence | nextjs/generator.ts:568; runtime (never read) | none |
| searchable modifier | partial | runtime search; Convex/OpenAPI/Zod/Next.js | prisma/generator.ts:1080; drizzle GIN | §16 projection claim accurate |
| encrypted modifier | wired | — | runtime-engine.ts:991-1045; conformance 91 | none |
| masked + maskStrategy + unmaskWhen | wired | — | masking.ts:11-38; runtime-engine.ts:1924-1991; conformance 93 | §18 output EXAMPLES are wrong (see incorrect note) |
| autoNow (= now()/= today()) | wired | — | ir-compiler.ts:778,790-795; runtime-engine.ts:2045-2047 | none |
| defaultValue | wired | — | runtime-engine.ts:2043-2044; prisma/generator.ts:377-394 | none |

### Group: entity-structure

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| entity parent inheritance (extends) | **wired** *(verifier corrected from partial)* | — | entity-composition.ts:154-166; conformance 79.ir.json:73-147 + conformance.test.ts:273 deep-equal | §7 "flatten or preserve depending on projection" is wrong: always pre-flattened |
| mixin composition | wired | — | entity-composition.ts:169-184; conformance 78.ir.json:73-147 | §7 same correction; mixins field traceability-only |
| IRModule grouping (output organization) | partial | no projection splits output by module | prisma/generator.ts:95 (@@schema); openapi title only | §4 "prevent one giant pile" not delivered |
| IRValueObject embedding | partial | Convex errors, OpenAPI→string, Zod→z.unknown(); runtime no validation | prisma/generator.ts:253-262 (Json OK); convex/generator.ts:231-240 (error) | §5 must scope to SQL persistence projections |
| external entities | wired | — | ir-compiler.ts:694; prisma/generator.ts:1223-1230; drizzle test:266-274 | §12 accurate |

### Group: keys-relations

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| composite key[] (entity.key) | partial | runtime (always uses 'id') | prisma/generator.ts:1043 (@@id); runtime-engine.ts:1184-1187 comment | §8 must warn runtime ignores entity.key |
| alternateKeys[][] (unique [...]) | partial | runtime; convex/kysely/openapi/zod | prisma/generator.ts:1054; runtime (no ref) | §8 note only prisma/drizzle emit constraints |
| relationships hasMany/hasOne/belongsTo/ref | **partial** *(verifier corrected from wired)* | runtime end-to-end tests for hasOne + ref | runtime-engine.ts:1263-1331 (all 4 cases); conformance 02 only covers hasMany+belongsTo | hasOne/ref runtime paths untested E2E |
| foreignKey fields[]/references[] | partial | runtime composite FK (single-col only) | prisma/generator.ts:545-779; runtime-engine.ts:1188-1190 drops composite | §20 must warn runtime = single-col FK only |
| through join entities (M2M) | partial | runtime + Prisma + Drizzle all unimplemented | prisma/generator.ts:575-587 (UNIMPLEMENTED diag); runtime-engine.ts:1174-1193 ignores through | §20 must state through is not implemented anywhere |
| foreignKey/through mutual-exclusivity enforcement | incorrect | parser + compiler + schema (no oneOf) | ir.ts:219 JSDoc only; ir-compiler.ts (no diagnostic); irexplained.md:1026 | doc says "explicitly … mutually exclusive" implying enforcement — none exists |
| RefAction cascade/restrict/setNull/setDefault/noAction | partial | runtime never enforces; kysely no emit | prisma/generator.ts:774-779; runtime-engine.ts (zero refs) | §21 must state DB-only, never runtime-enforced |

### Group: entity-runtime-flags

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| versionProperty/versionAtProperty concurrency | wired | — | runtime-engine.ts:2063-2067,2208-2224; conformance 54 | none |
| timestamps:true auto createdAt/updatedAt | wired | — | runtime-engine.ts:2070-2073,2244-2246; conformance 62 | none |
| realtime flag → SSE (Next.js) | wired | — | nextjs/generator.ts:269-275,1343-1369; test:964-1171 | §11 could note only Next.js implements SSE |
| IRTransition state-machine enforcement | wired | — | runtime-engine.ts:2250-2263,3397-3402; conformance 38 | §13 "only if runtime enforces" caveat now moot |

### Group: constraints

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IRConstraint severity ok/warn/block | partial | ok does not force passed=true (semantics.md:139 mismatch) | runtime-engine.ts:4595,4657; semantics.md:139 | §22 reconcile ok semantics with spec |
| messageTemplate interpolation | wired | — | runtime-engine.ts:4586-4589,4524-4557; conformance 21 | none |
| detailsMapping | wired | — | runtime-engine.ts:4575-4581,4597; conformance 21 | none |
| overrideable + overridePolicyRef | wired | — | runtime-engine.ts:4623,4641-4651; conformance 52/53 | none |
| OverrideRequest/ConstraintOutcome runtime flow | partial | auto-policy path emits no OverrideApplied audit event | runtime-engine.ts:4641-4651 (no buildOverrideAppliedEvent) | §23 must clarify auto-policy override not audited |
| entity-level vs command-level constraints | partial | entity-level override never evaluated | runtime-engine.ts:2159-2165 (no override) vs 4610-4663 | §22 override only for command-level constraints |
| Constraint expression polarity ('severity' name prefix) | incorrect | — (undocumented magic) | runtime-engine.ts:4569-4572,3775-3781; semantics.md silent | §22 must DOCUMENT name-prefix polarity inversion |

### Group: commands

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| guards ordering + halt-on-first-falsey | wired | — | runtime-engine.ts:3282-3303; conformance 11 | none |
| parameters required/defaults validation | partial | runtime (never reads command.parameters) | runtime-engine.ts (zero 'parameters'); openapi:323-331 | §34 note runtime skips param validation |
| action kind: mutate | wired | — | runtime-engine.ts:4014-4021 | none |
| action kind: emit | partial | runtime emits anonymous 'action_event', ignores target | parser.ts:863; runtime-engine.ts:4023-4047 | §37 note anonymous event |
| action kind: compute | wired | — | runtime-engine.ts:4053-4060 | §37 note compute == mutate at runtime |
| action kind: effect | partial | no adapter/side-effect hook invoked | runtime-engine.ts:4062-4065 (result discarded) | §37 note no side-effect dispatch |
| action kind: publish | partial | identical to emit-as-action; no per-action bus.publish | runtime-engine.ts:4023-4047,4851-4863 | §37 note publish == emit-as-action |
| action kind: persist | partial | no store write (no-op in non-deterministic mode) | runtime-engine.ts:4049-4051; deterministic test:74-76 | §37 note persist-as-action is a no-op |
| emitPayloads | wired | — | runtime-engine.ts:3478-3483; convex functions.test.ts:387 | none |
| returns typing | partial | runtime never validates/coerces returns | nextjs:986; runtime-engine.ts (zero refs) | note returns is projection-only metadata |
| execution order (policies→guards→…) | incorrect | — | semantics.md:310-318 + runtime-engine.ts:3215-3469 vs irexplained.md:1744-1760 | doc reverses first 5 phases — must be rate-limit→policies→constraints→guards→actions→emits→return |

### Group: async-retry-rate

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| async:true + completionEvent/failureEvent | wired | — | ir-compiler.ts:1081-1084,458-492; runtime-engine.ts:2413,3053-3144; runtime-async.test.ts | §40 replace "apparently"; note no worker auto-started |
| JobRecord/JobQueue (Memory + Postgres) | wired | — | runtime-engine.ts:631-658; jobs/stores/postgres.ts:122; jobs/worker.test.ts:148 | §40 note host must configure jobQueue + poll |
| IRRetry maxAttempts/backoff/jitter/retryOn | partial | retryOn≠CONCURRENCY_CONFLICT/TIMEOUT is dead; no projection; no results.json | runtime-command-extensions.ts:91-95; runtime-retry.ts:83 | §24 (1228-1229) SUPPLIER_UNAVAILABLE never matches |
| IRRateLimit user/tenant/global + burstAllowance | partial | in-memory only (no durable); no projection exposes it; policy path no results test | runtime-rate-limit.ts:4,41-105; runtime-engine.ts:3215-3233,3716-3735 | §25 note in-memory, resets per process |

### Group: events-reactions-sagas

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IREvent channel/payload + MemoryEventBus | wired | — | runtime-engine.ts:3496-3498,4856; event-bus.ts:48; conformance 15 | none |
| IREvent + RedisEventBus (cross-process) | partial | never wired into RuntimeEngine outside tests | events/redis.ts:55 (orphan, test-only) | doc doesn't mention Redis; check event-wiring.md |
| IRReactionRule resolve (single-target) | wired | — | runtime-engine.ts:3587-3628; conformance 67 | none |
| IRReactionRule fanOut (collection) | wired | — | runtime-engine.ts:3552-3583; conformance 96 | §28 shows ellipsis not real shape { matchField, matchSource } |
| IRSaga steps + compensate | wired | — | runtime-engine.ts:2540-2680; runtime-saga.test.ts:376-454 | §29 omits IRSagaStep.compensateEntity |
| IRSaga onFailure: abort | wired | — | runtime-engine.ts:2593-2598; runtime-saga.test.ts:283-360 | none |
| IRSaga emits lifecycle | wired | — | runtime-engine.ts:2694-2701; runtime-saga.test.ts:128-148 | none |

### Group: schedules-webhooks

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IRSchedule — cron trigger | wired | — | runtime-engine.ts:1748-1798; schedule-worker.ts:98-157; conformance 76 | §30 snippet missing name/module/entityName |
| IRSchedule — interval/every triggers | partial | Next.js/Vercel projection emits cron only | schedule-generator.ts:23-24 (cron filter); convex ok | §30 warn interval/every need schedule-worker pkg |
| IRWebhook — path/method/command/entity/transform | wired | — | webhooks/handler.ts:65-205; nextjs/express/hono generators | §31:1623 caveat now factually WRONG (see incorrect row) |
| IRWebhook — signature HMAC (sha256/sha512) | partial | Convex projection skips HMAC entirely | webhooks/handler.ts:97-129; convex/orchestration.ts:85-104 | §32 note Convex skips verification |
| IRWebhook — idempotencyHeader dedup | partial | Convex projection ignores it | webhooks/handler.ts:131-149; convex/orchestration.ts:85-104 | §33 note fail-closed + Convex gap |
| IRSchedule/IRWebhook interface snapshots | incorrect | — | irexplained.md:1519-1523,1570-1579,1623 vs ir.ts:287-298,383-400 | shapes incomplete; 1623 caveat wrong |

### Group: authz-approvals

| Feature | Final status | Missing layers | Key evidence | Doc impact |
|---|---|---|---|---|
| IRPolicy action=execute/all enforcement | wired | — | runtime-engine.ts:3699-3755; conformance 06 | none |
| IRPolicy action=read/write/delete enforcement | partial | no separate runtime read-gate (getAllInstances no policy check) | runtime-engine.ts:3706-3710,1864-1870 | §41 clarify no independent read gate |
| IRPolicy rateLimit | partial | no runtime conformance test (75 has IR only) | runtime-engine.ts:3716-3736; conformance 75.ir.json only | §25 policy path exists but untested |
| IRRole parent inheritance + effectivePermissions | wired | — | ir-compiler.ts:1342-1448; runtime-engine.ts:1196-1216; conformance 71 | §42 accurate |
| IRRole allow/deny + custom permissions | wired | — | ir-compiler.ts:1317-1331,1392-1448; convex functions:344-351 | §43 accurate |
| roleAllows case-sensitivity | wired | — | runtime-engine.ts:1199,1210,1583-1589 | §42-43 must note exact case-sensitive matching |
| IRApproval stages/policy/required/when + RBAC | wired | — | runtime-engine.ts:4964-5043,5116-5181; runtime-approval.test.ts:225-476 | §14 accurate |
| IRApproval onTimeout='cancel' | wired | — | runtime-engine.ts:5024,5220-5233; test:332-354 | none |
| IRApproval onTimeout='escalate' | partial | runtime; expireApprovals treats escalate == cancel | runtime-engine.ts:5213 (comment "future"),5220-5233 | §14 escalate not implemented |
| ApprovalStore (memory + postgres) | wired | — | runtime-engine.ts:913-940; memory.test.ts + postgres.test.ts | none |

---

## irexplained.md corrections

Numbered, actionable edits. Items 1-8 are the fidelity-group interface transcription omissions; 9-49 are wiring claims the doc gets wrong or must caveat.

**Interface-shape fidelity fixes**

1. **§30 (line ~1520-1524) IRSchedule** — snippet shows only `{commandName, trigger, params}`. Add the missing fields from ir.ts:287-297: `name: string` (required identifier, list first), `module?: string`, `entityName?: string` (load-bearing for entity-scoped scheduled commands).
2. **§14 (line ~697-700) IRApprovalStage** — add required `name: string` as the first field (ir.ts:103-111); it uniquely identifies a stage within a workflow.
3. **§42 (line ~2070-2076) IRRole** — add required `name: string` (first) and optional `module?: string` (ir.ts:479-488). Prose "Roles contain:" implies completeness.
4. **§28 (line ~1405-1412) IRReactionRule** — add `module?: string` and `entity?: string` (ir.ts:322-337; `entity` scopes a reaction to an entity context). Replace the `fanOut?: ...` ellipsis with the real shape `fanOut?: { matchField: string; matchSource: IRExpression }` (ir.ts:334).
5. **§29 (line ~1460-1464) IRSaga** — add `module?: string` (ir.ts:357-365). Also add `IRSagaStep.compensateEntity` (ir.ts:352) to the step description — compensation may target a different entity than the forward step.
6. **§31 (line ~1570-1580) IRWebhook** — add `module?: string` after `name` (ir.ts:383-400).
7. **§34 (line ~1713-1729) IRCommand** — add `module?: string` between `name` and `entity` (ir.ts:402-427).
8. **§4 (line ~178-188) IRModule** — the `...` ellipsis hides five public optional arrays. Expand or explicitly list: `reactions?: string[]`, `sagas?: string[]`, `roles?: string[]`, `schedules?: string[]`, `webhooks?: string[]` (ir.ts:65-78).

**Wiring-claim fixes / caveats**

9. **§44 IRType.params (precision/scale)** — doc calls precision/scale meaningful "for money" without noting projections never read `IRType.params`. Add: Prisma/Drizzle use a separate `options.precision[entity][property]` config (prisma/generator.ts:346); `IRType.params` is currently stranded.
10. **§46 lambda** — add: the Convex projection cannot transpile lambdas (convex/expression.ts:191-193 emits `/* unresolved lambda */ undefined`); lambdas run only in the reference runtime.
11. **§47 aggregate count** — add: evaluation is a full table scan with no predicate pushdown (runtime-engine.ts:4219-4241 → getAllInstancesRaw); counts against large external stores will be slow.
12. **§3 tenant** — doc lists "projections generate tenant-aware code" as a required layer. Correct: only Prisma and Convex read `ir.tenant`; Next.js/SvelteKit/Remix/Express/Hono use generator **options** independent of `ir.tenant`, so a tenant declaration does NOT auto-produce tenant-filtered routes in those framework projections (nextjs/generator.ts:123-130).
13. **§16 required / unique** — doc: "unique → … validation → generated form behavior" and required implied enforced. Correct: the **runtime enforces neither required nor unique** (no null/missing check, no duplicate check on create/update). DB constraints (Prisma @unique, Drizzle .notNull/.unique) are real; validation and form behavior are aspirational.
14. **§16 private** — doc: "private → API/read filtering." Correct: the runtime strips a property only when it carries **both** `private` and `masked` (runtime-engine.ts:1951-1953). A plain `private` field (no `masked`) is returned in full by getInstance/getAllInstances. State that plain-private runtime filtering is not implemented.
15. **§18 masking output examples** — all three examples misstate actual output (masking.ts): redact returns `***` (3 stars, not `********`); phone returns `***-***-XXXX` (not `(***) ***-1234`); last4 returns `****XXXX` (4 stars, not `********1234`). Fix each example to the real format.
16. **§7 extends/mixin** — doc: compiler can "flatten or preserve these concepts depending on the target projection." Correct: parent + mixin members are **always pre-flattened at AST time** (entity-composition.ts:154-184) before IR is produced; the `parent`/`mixins` fields in IR are traceability-only and no projection reads them. Mixin source entities remain as standalone entries in `ir.entities`.
17. **§4 modules** — doc: modules "let generators organize output and prevent the entire application from becoming one giant undifferentiated pile." Correct: no projection splits output artifacts by module. Only Prisma uses `entity.module` for `@@schema` (opt-in multiSchema) and OpenAPI uses the first module name for the API title. The "prevent one giant pile" claim is not delivered.
18. **§5 value objects** — doc: value objects are "embedded, not separate tables." Accurate only for Prisma/Drizzle/prisma-store (Json/jsonb). Add: Convex hard-errors (CONVEX_UNKNOWN_TYPE, convex/generator.ts:231-240), OpenAPI silently emits `{ type: 'string' }`, Zod emits `z.unknown()`; only SQL persistence projections handle value-object types, and the runtime does no structural validation.
19. **§8 composite key** — add warning: the runtime ignores `entity.key` and always uses `'id'` for identity/relationship resolution (runtime-engine.ts:1184-1187). Composite-key identity is unsupported at runtime.
20. **§8 alternateKeys** — add: only Prisma/Drizzle emit `@@unique`; the runtime does not enforce alternate-key uniqueness; Convex/Kysely/OpenAPI/Zod ignore it.
21. **§20 foreignKey (fields/references)** — add warning: the runtime supports **single-column FK only**; a composite `fields.length > 1` is silently dropped and the engine falls back to the `${relName}Id` convention, which may return the wrong row (runtime-engine.ts:1188-1190).
22. **§20 through (M2M)** — doc presents `through` as a working structural option. Correct: neither the runtime nor the Prisma nor the Drizzle projection implements it — Prisma emits `PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED`, Drizzle skips it, runtime ignores `rel.through` (falls into hasMany path).
23. **§20 (line 1026) mutual exclusivity** — doc: "The interface explicitly says foreignKey and through are mutually exclusive," implying enforcement. Correct: it is only a JSDoc comment; there is no parser/compiler diagnostic and no `oneOf` in the schema — a user can supply both and get an IR with both fields set. Reword to "documented as mutually exclusive but not enforced."
24. **§21 RefAction** — add: referential actions (cascade/restrict/setNull/setDefault/noAction) are **DB-only (projection-delegated)** and never enforced by the Manifest runtime engine — deleting a parent does not cascade, restrict, or null child FKs.
25. **§22 constraint ok severity** — reconcile with semantics.md:139 ("ok outcome is always passed regardless of expression result"). The runtime sets `passed` from the expression result even for `ok` (no forced `passed=true`), so `ok` behaves like `warn`. Either document that ok can be `passed:false`, or fix semantics.md — flag the divergence.
26. **§23 override audit** — doc implies all overrides are audited ("records who authorized it, when"). Correct: the auto-policy path (`overridePolicyRef` fires without an explicit OverrideRequest) sets `overridden=true` but does NOT emit an `OverrideApplied` event (runtime-engine.ts:4641-4651) — the audit trail is incomplete for that path.
27. **§22 entity-level vs command-level constraints** — add: `overrideable`/`overridePolicyRef` are evaluated **only for command-level constraints** (evaluateCommandConstraints). Entity-level constraint override fields are compiled but never evaluated (createInstance/updateInstance → validateConstraints takes no OverrideRequest).
28. **§22 constraint polarity** — DOCUMENT the hidden heuristic: constraints whose `name` starts with `"severity"` use **inverted polarity** (expression true = bad state = `passed:false`), per runtime-engine.ts:4569-4572. This is absent from semantics.md too. Add it to the spec or replace the heuristic with an explicit IR field — without it, callers write constraint expressions backwards.
29. **§34 parameters** — doc (1793-1803): generators "could theoretically" validate. Add: projections do (OpenAPI/Zod/Convex read `required`/`defaultValue`), but the **runtime never reads `command.parameters`** — required is not enforced and defaultValue is never applied to command input.
30. **§37 emit action** (1866-1868) — add: at runtime, emit-as-action ignores `action.target` and emits an anonymous event named `'action_event'` on channel `'default'` (runtime-engine.ts:4023-4047), not a named event.
31. **§37 compute action** (1869-1870) — add: at runtime `compute` is identical to `mutate` (both call updateInstance); no separate semantic.
32. **§37 effect action** (1872-1873) — add: the runtime evaluates the expression but invokes **no side-effect hook/adapter**; the result is discarded (runtime-engine.ts:4062-4065). Effect is blocked in deterministic mode.
33. **§37 publish action** (1875-1877) — add: publish-as-action is identical to emit-as-action (anonymous `action_event` to the eventLog); there is no per-action `bus.publish()` — the bus publish is post-command for all emitted events.
34. **§37 persist action** (1878-1879) — add: persist-as-action is a **no-op** in non-deterministic mode (throws in deterministic mode); real persistence happens only via mutate/compute → updateInstance.
35. **§34 returns** — add: `command.returns` is **projection-only metadata** (TS/OpenAPI/Zod type annotations); the runtime never validates or coerces the result against the declared return type.
36. **Execution-order diagram (lines 1744-1760)** — INCORRECT: doc orders inputs→guards→constraints→authorization→rate-limit→…, reversing the first five phases. Correct to match semantics.md:310-318 and runtime-engine.ts:3215-3469: **rate-limit → policies → constraints → guards → actions → emits → return**.
37. **§40 async** (line 1939) — replace "The compiler apparently auto-derives event names" with definitive language: convention is `${commandName}Completed` / `${commandName}Failed`, channel `jobs.${commandName}`. Also add: no worker is auto-started — the host must configure `RuntimeOptions.jobQueue` and separately poll via `drainJobs()`/`runJobWorker()`; without a jobQueue the runtime returns `MISSING_JOB_QUEUE`.
38. **§24 retryOn** (lines 1228-1229) — doc lists `NETWORK_TIMEOUT` and `SUPPLIER_UNAVAILABLE` as example retryOn values. Correct: `extractRetryErrorCode` only ever produces `CONCURRENCY_CONFLICT` or `TIMEOUT` (runtime-command-extensions.ts:91-95); `NETWORK_TIMEOUT` matches incidentally (contains "TIMEOUT") but `SUPPLIER_UNAVAILABLE` never matches. retryOn does not accept arbitrary custom error codes — other codes are dead config.
39. **§25 rateLimit** (lines 1293-1295) — appropriately hedged, but add: enforcement is **in-memory only and resets on process restart** (runtime-rate-limit.ts:4; no durable adapter shipped); command rateLimit is enforced before policy evaluation; policy rateLimit adds a check inside the policy gate; no projection exposes rateLimit in generated API/docs.
40. **§30 interval/every schedules** — add: the Next.js/Vercel projection only emits cron-kind schedules (schedule-generator.ts:23-24 filters `kind==='cron'`); interval/every schedules produce no Vercel cron route and require the separately-published `./schedule-worker` (`startScheduleWorker()`).
41. **§32 webhook signature** — accurate on the fields, but add: the Convex projection ignores `IRWebhook.signature` entirely (convex/orchestration.ts:85-104) — generated Convex httpActions have no HMAC verification.
42. **§33 idempotencyHeader** — add: fail-closed behavior (500 if `idempotencyHeader` declared but no IdempotencyStore configured; 400 if header missing) and note the Convex projection does not implement idempotency (duplicate deliveries re-run the mutation).
43. **§31 (line 1623)** — the caveat "this interface does not prove there is an actual HTTP server implementation registering the routes" is now factually WRONG. `src/manifest/webhooks/handler.ts` is the reference runtime handler (published as the `./webhooks` subpath) and the Next.js/Express/Hono projections generate functional routes that call it. Replace the caveat with a description of `webhooks/handler.ts` and which projections wire it.
44. **§41 read/write/delete policies** — doc: "Policies can cover: reading, writing, deletion, …" without qualification. Add: there is **no separate runtime read-gate** — `getAllInstances`/`getInstanceRaw` apply masking + tenant filter but no policy check (runtime-engine.ts:1864-1870); read/write/delete policies fire only at command-execution time when linked via `command.policies`.
45. **§42-43 roleAllows** — add: role matching is **exact and case-sensitive** — `'Admin'` and `'admin'` are different roles (runtime-engine.ts:1199,1210); a caller passing the wrong case silently gets `false` (fail-closed, no error). (MEMORY.md notes 61 latently-wrong capsule tests from this.)
46. **§14 approval onTimeout='escalate'** — doc lists `escalate` as a supported timeout behavior. Correct: it is not implemented — `expireApprovals` sets `status='expired'` for all timed-out requests regardless of onTimeout, so escalate behaves identically to cancel (runtime-engine.ts:5213,5220-5233).
47. **§26 durable / mongodb** — minor technical accuracy: `durable` and `mongodb` are NOT lexer keywords; they tokenize as identifiers (still parse correctly). Note it if the section implies keyword status.
48. **§26 postgres/supabase/durable/mongodb stores** — add: the runtime does NOT auto-instantiate these; each `case` throws directing the consumer to supply `storeProvider` (or import the store class from stores.node.ts). Only memory and localStorage are auto-instantiated.
49. **§11 realtime** — accurate ("projection hint, no runtime semantics"), but could add that currently **only the Next.js projection** generates an SSE surface from the flag; no other projection acts on it.

---

## Wiring gaps (code, not docs)

Genuine code gaps (partial/incorrect-enforcement features). For the human — these are missing implementation, not doc edits.

**Runtime enforcement missing (IR compiles, runtime ignores):**
- `required` / `unique` modifiers not enforced at runtime — no missing-field or duplicate check on create/update (runtime-engine.ts).
- `readonly` modifier does not block writes at runtime.
- Plain `private` (without `masked`) not stripped on read — only `private + masked` is filtered (runtime-engine.ts:1951-1953).
- Command **parameter validation absent** — runtime never reads `command.parameters`; `required` not enforced, `defaultValue` never applied to command input.
- `command.returns` never validated/coerced at runtime.
- **Composite keys**: runtime ignores `entity.key`, always assumes `'id'` (runtime-engine.ts:1184-1187).
- **Composite FK** (`fields.length > 1`): silently dropped; may return wrong row (runtime-engine.ts:1188-1190).
- **through / M2M**: not implemented in runtime OR Prisma OR Drizzle (all emit diagnostics/skip).
- **RefAction** cascade/restrict/setNull/setDefault/noAction: never enforced by runtime (DB-delegated only).
- **alternateKeys** uniqueness: not enforced at runtime.

**Correctness / spec divergences:**
- **Execution-order** doc diagram wrong (partial doc; code is correct) — order is rate-limit→policies→constraints→guards→actions→emits→return.
- **foreignKey/through mutual exclusivity** — no enforcement anywhere; both can be set (documented-only JSDoc).
- **Constraint `ok` severity** does not force `passed=true` per semantics.md:139 — behaves like `warn`.
- **Constraint polarity** relies on a hidden `"severity"` name-prefix heuristic (runtime-engine.ts:4569-4572) — fragile magic; should be an explicit IR field.
- **Auto-policy override** path emits no `OverrideApplied` audit event (runtime-engine.ts:4641-4651).
- **Entity-level constraint overrides** compiled but never evaluated.

**Action-kind semantics collapsed:**
- `emit`/`publish` actions emit an anonymous `'action_event'` (ignore target name).
- `effect` action: no side-effect hook invoked; result discarded.
- `persist` action: no-op in non-deterministic mode (real persistence only via mutate/compute).
- `compute` action: identical to `mutate` (no distinct behavior).

**Projection gaps:**
- `IRType.params` (precision/scale) read by no projection (Prisma/Drizzle use parallel `options.precision`).
- Lambda expressions not transpilable in Convex.
- Value objects: Convex errors, OpenAPI emits `{type:'string'}`, Zod emits `z.unknown()`.
- `indexed` modifier: Prisma/Drizzle emit no index (only Convex consumes it).
- Framework projections (Next.js/SvelteKit/Remix/Express/Hono) don't derive tenant behavior from `ir.tenant`.
- No projection splits output artifacts by `module`.
- Convex webhook projection skips both HMAC signature verification and idempotency.
- Next.js/Vercel schedule projection drops interval/every schedules (cron only).
- No projection consumes the `retry` or `rateLimit` IR fields for generated API/docs.

**Infrastructure / config gaps:**
- Rate limiter in-memory only — no durable adapter; resets per process restart.
- `retryOn` accepts only `CONCURRENCY_CONFLICT`/`TIMEOUT`; other codes are dead config.
- RedisEventBus never wired into a RuntimeEngine outside tests (orphan/test-only module).
- Stores postgres/supabase/durable/mongodb: not auto-instantiated — `storeProvider` required (by design, but zero-config gap).
- Approval `onTimeout='escalate'` unimplemented (behaves as cancel).
- Policy `read/write/delete`: no independent runtime read-gate; policy `rateLimit`: no runtime conformance test.
- `hasOne` / `ref` relationship runtime paths exist but are untested end-to-end.

---

## Doc-sweep guidance

For each partial/incorrect feature: grep keywords for other docs (docs/**, README, guides) and the corrected sentence an overclaiming doc must adopt. Grep the whole docs tree — irexplained.md is not the only place these claims appear.

| Grep keywords | If a doc says (overclaim) → change to |
|---|---|
| `precision`, `scale`, `@db.Decimal`, `decimal(` | "decimals carry precision/scale into projections" → "projections read precision from `options.precision` config, not from the IR type; `IRType.params` is not consumed" |
| `lambda`, `.all(`, `.any(`, `arr.all` | "lambdas work across projections" → "lambdas evaluate only in the reference runtime; Convex cannot transpile them" |
| `count(`, `aggregate`, `predicate pushdown` | "count() is efficient" → "count() is a full table scan with no predicate pushdown" |
| `tenant`, `multiTenant`, `tenantId`, `RLS`, `row-level` | "tenant declaration makes all projections tenant-aware" → "only Prisma/Convex read `ir.tenant`; framework projections rely on generator options; the runtime enforces tenant isolation" |
| `required`, `unique`, `validation`, `runtime validation` | "required/unique are validated" → "enforced only as DB constraints (Prisma/Drizzle); the runtime does not validate required or uniqueness" |
| `private`, `read filtering`, `API filtering` | "private fields are filtered from reads" → "only `private + masked` fields are stripped at runtime; plain private is returned in full" |
| `readonly` | "readonly is enforced" → "readonly affects codegen only; the runtime does not block writes" |
| `mask`, `redact`, `********`, `last4`, `phone` | any `********`/`(***) ***-1234`/`********1234` example → real formats `***`, `***-***-XXXX`, `****XXXX` |
| `extends`, `mixin`, `inheritance`, `flatten`, `preserve` | "projections choose to flatten or preserve inheritance" → "parent/mixin members are always pre-flattened at compile time; IR `parent`/`mixins` are traceability-only" |
| `module`, `organize output`, `separate files`, `namespace` | "modules split/organize generated output" → "modules affect only Prisma @@schema (multiSchema) and OpenAPI title; no projection emits per-module files" |
| `value object`, `value X`, `embedded`, `jsonb`, `Json` | "value objects work everywhere / are embedded" → "only SQL persistence projections (Prisma/Drizzle/prisma-store) embed as Json/jsonb; Convex errors, OpenAPI→string, Zod→z.unknown()" |
| `composite key`, `key [`, `@@id`, `composite PK` | "composite keys are used at runtime" → "composite keys emit @@id in Prisma/Drizzle only; the runtime always uses `id`" |
| `alternateKeys`, `unique [`, `@@unique` | "alternate keys are enforced" → "emitted as @@unique in Prisma/Drizzle only; not runtime-enforced" |
| `foreignKey`, `fields [`, `references [`, `composite FK` | "composite FKs resolve at runtime" → "runtime supports single-column FK only; composite FK is dropped" |
| `through`, `many-to-many`, `m2m`, `join table`, `join entity` | "through/M2M is supported" → "through is unimplemented in runtime, Prisma, and Drizzle" |
| `onDelete`, `onUpdate`, `cascade`, `restrict`, `setNull`, `referential` | "cascade/restrict work" → "referential actions are DB-only (Prisma/Drizzle); the Manifest runtime never enforces them" |
| `mutually exclusive`, `oneOf`, `foreignKey and through` | "foreignKey and through are mutually exclusive (enforced)" → "documented as mutually exclusive but not enforced — both can be set without error" |
| `constraint`, `ok severity`, `passed`, `severity: ok` | "ok constraints always pass" → reconcile: runtime sets `passed` from the expression even for ok (matches warn) |
| `override`, `overridePolicy`, `OverrideApplied`, `audit` | "all overrides are audited" → "auto-policy overrides (overridePolicyRef, no OverrideRequest) emit no OverrideApplied audit event" |
| `severity`, `negative constraint`, `polarity`, `fire when true` | (missing) → document the `"severity"` name-prefix polarity-inversion convention |
| `parameters`, `param required`, `default`, `command input` | "commands validate parameters" → "projections generate validation; the runtime does not validate params or apply defaults" |
| `emit`, `publish`, `action_event`, `side effect`, `effect`, `persist` | "emit/publish/effect/persist actions do X at runtime" → "emit/publish emit an anonymous action_event; effect calls no hook; persist is a no-op (real writes only via mutate/compute)" |
| `returns`, `return type`, `response schema` | "runtime enforces return type" → "returns is projection-only metadata; the runtime does not validate it" |
| `execution order`, `policies`, `guards`, `constraints`, `pipeline` | any order other than rate-limit→policies→constraints→guards→actions→emits→return → fix to that order |
| `async`, `worker`, `drainJobs`, `jobQueue`, `completionEvent` | "async commands run automatically" → "no worker auto-starts; host must configure jobQueue and poll via drainJobs()/runJobWorker(); else MISSING_JOB_QUEUE" |
| `retryOn`, `retry`, `SUPPLIER_UNAVAILABLE`, `NETWORK_TIMEOUT` | "retryOn accepts custom error codes" → "only CONCURRENCY_CONFLICT and TIMEOUT are retryable; other codes never match" |
| `rateLimit`, `rate limit`, `burstAllowance`, `durable` | "rate limits are durable/enforced everywhere" → "in-memory only, resets per process; no durable adapter; no projection exposes it" |
| `schedule`, `interval`, `every`, `vercel.json`, `cron` | "all schedules run on Vercel" → "Next.js/Vercel projection emits cron-kind only; interval/every need the schedule-worker package" |
| `webhook`, `signature`, `hmac`, `idempotency`, `Convex webhook` | "Convex webhooks verify signatures / dedupe" → "Convex projection skips HMAC verification and idempotency; the reference handler and Next.js/Express/Hono enforce both" |
| `HTTP server`, `register routes`, `webhook handler` | "no HTTP server implementation exists for webhooks" → "webhooks/handler.ts is the reference handler; Next.js/Express/Hono generate routes that call it" |
| `policy`, `read policy`, `write policy`, `read gate` | "read/write/delete policies gate reads" → "no separate runtime read-gate; they fire only at command execution via command.policies" |
| `role`, `roleAllows`, `case`, `Admin`, `permission` | "role names are case-insensitive" → "role matching is exact and case-sensitive ('Admin' ≠ 'admin'), fail-closed with no error" |
| `approval`, `onTimeout`, `escalate` | "escalate is supported" → "escalate is not implemented; behaves as cancel (status=expired)" |
| `postgres`, `supabase`, `mongodb`, `durable`, `storeProvider` | "postgres/mongodb/etc. work out of the box" → "only memory/localStorage auto-instantiate; other targets require a storeProvider" |
| `Redis`, `RedisEventBus`, `cross-process events` | "Redis event bus is wired" → "RedisEventBus is shipped and unit-tested but never wired into a RuntimeEngine outside tests" |
| `indexed`, `@@index`, `.index(` | "indexed properties get DB indexes" → "only Convex consumes `indexed`; Prisma/Drizzle emit no index for it" |
