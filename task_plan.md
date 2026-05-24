# task_plan.md — Manifest 1.0: Composite PK/FK + Referential Actions

## Phases

### Phase 0 — Full inventory (READ ONLY)
- [ ] A. Grammar investigation
- [ ] B. IR investigation (3 representative entities)
- [ ] C. Projection investigation
- [ ] D. foreignKey blast-radius (all readers)
- [ ] E. Full gap list
- [ ] F. Classification (SEMANTIC-CORE vs PROJECTION-CONFIG)
- [ ] CHECKPOINT 0 — Report gap list + classification + blast radius

### Phase 1 — Grammar + IR design (DESIGN, get approval)
- [ ] Grammar surface design for approved scope
- [ ] IR shape design for approved scope
- [ ] Projection-config boundary design
- [ ] Backward-compat / migration story
- [ ] CHECKPOINT 1 — Approve grammar + IR design

### Phase 2 — Core grammar + IR implementation ✅
- [x] Grammar/parser for composite FK, composite PK, non-id references, referential actions
- [x] IR extension (foreignKey becomes structured form)
- [x] Unit tests for 3 representative entities (9 tests added, all passing)
- [ ] CHECKPOINT 2 — Core diffs + passing tests

### Phase 3 — Projection implementation
- [ ] Composite @@id primary keys
- [ ] Composite FK with correct fields/references
- [ ] Non-id references targets
- [ ] onDelete/onUpdate referential actions
- [ ] Golden tests for 3 entities + regression test
- [ ] CHECKPOINT 3 — Projection diffs + golden tests

### Phase 4 — Migrate all foreignKey readers
- [ ] Migrate all readers from Phase 0(D)
- [ ] Assertion/test for each migrated reader
- [ ] Full typecheck/build green
- [ ] CHECKPOINT 4 — Reader migration diffs + green build

### Phase 5 — Round-trip verification
- [ ] Generate schema.prisma for real multi-tenant entities
- [ ] Diff against real schema
- [ ] Report remaining diffs
- [ ] Final notes.md update
- [ ] CHECKPOINT 5 — Final report (1.0 acceptance gate)

## Status
Phase 0 COMPLETE
Phase 1 COMPLETE — Grammar + IR design approved
Phase 2 COMPLETE — Core grammar + IR implementation done; awaiting CHECKPOINT 2 approval

## Scope Adjustments (user approved)
- @@unique for relationship-backing / alternate identity → SEMANTIC-CORE (added to scope)
- Pure performance @@index → PROJECTION-CONFIG (excluded from scope)
- Item 9 (through wiring bug // PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED) → DEFERRED to separate follow-up task (not this 1.0 wave)
- Phase 4 blast radius: must re-verify in main context, not inherited from subagent

## Design Corrections (CHECKPOINT 1 blockers fixed)
- **BLOCKER 1 fixed**: alternateKeys is `string[][]` (multiple alternate keys, each a column-list). IREntity type corrected. JSON schema single block with no duplication, no typo.
- **BLOCKER 2 fixed**: case 3 (references-only, no fields) infers local from `relName + "Id"`, not from `references[0]`. Composite refs without fields = parse error. Cases 3 and 4 now unambiguous.
- **Clarification 1**: Invariant stated — `foreignKey` and `through` are mutually exclusive. hasMany+through → through only; belongsTo with FK → foreignKey only; ref → neither.
- **Clarification 2**: onDelete/onUpdate absent = emit nothing (let Prisma default). Critical for Phase 5 diff clean against 53 relations missing onDelete.
- **FIX 3 fixed**: canonical IR for `with authorId` is `{ fields: ["authorId"] }` with `references` absent. Projection defaults `references` to `["id"]`. Consistent with absent-means-default pattern.

## CHECKPOINT 2 Report

**Grammar + IR diffs:**
- `src/manifest/lexer.ts`: added keywords `key`, `fields`, `references`, `onDelete`, `onUpdate`, `cascade`, `restrict`, `setNull`, `setDefault`, `noAction`
- `src/manifest/types.ts`: added `RefAction` type; `RelationshipNode`: removed `foreignKey?: string`, added `fields?: string[]`, `references?: string[]`, `onDelete/onUpdate?: RefAction`; `EntityNode`: added `key?: string[]`, `alternateKeys?: string[][]`
- `src/manifest/ir.ts`: added `RefAction`, `IRForeignKey`; `IRRelationship.foreignKey?: string` → `foreignKey?: IRForeignKey`; added `onDelete`, `onUpdate`, `key`, `alternateKeys`
- `docs/spec/ir/ir-v1.schema.json`: added `IRForeignKey` definition; updated `IRRelationship` + `IREntity`
- `src/manifest/parser.ts`: added `parseIdentifierArray()` helper; updated `parseRelationship()` and `parseEntity()`
- `src/manifest/ir-compiler.ts`: updated `transformRelationship()` and `transformEntity()`

**Tests:** `npm test` → 1032/1032 passing. 9 new composite PK/FK tests all green.

**TypeScript red state (Phase 4 deferred):**
- `src/manifest/runtime-engine.ts`: 3 type errors (uses old string foreignKey) — intentional Phase 4 work
- `src/artifacts/zipExporter.ts`, `src/project-template/templates.ts`: have own local types, no TS errors yet; Phase 4 must migrate