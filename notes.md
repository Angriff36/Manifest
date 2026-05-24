# notes.md — Manifest 1.0: Composite PK/FK + Referential Actions

## Findings

### Phase 0 Inventory

#### A. Grammar Investigation

**Grammar file**: `C:\Projects\Manifest\src\manifest\parser.ts` (NO separate PEG grammar file — grammar is programmatic)

**RelationshipNode parse (parser.ts lines 263-271):**
```typescript
private parseRelationship(): RelationshipNode {
  const kind = this.advance().value as RelationshipNode['kind'];
  const name = this.consumeIdentifier().value;
  this.consume('OPERATOR', ':');
  const target = this.consumeIdentifier().value;
  let foreignKey: string | undefined, through: string | undefined;
  if (this.check('KEYWORD', 'through')) { this.advance(); through = this.consumeIdentifier().value; }
  if (this.check('KEYWORD', 'with')) { this.advance(); foreignKey = this.consumeIdentifier().value; }
  return { type: 'Relationship', kind, name, target, foreignKey, through };
}
```

**What grammar CAN express today:**
- `hasMany books: Book` — simple one-to-many
- `hasMany tags: Tag through AuthorTag` — many-to-many via explicit join table
- `belongsTo author: Author with authorId` — explicit FK property name
- `hasOne profile: Profile` — one-to-one
- `ref createdBy: Actor` — loose reference

**What grammar CANNOT express:**
- Composite primary keys (`@@id([tenantId, externalId])`)
- Composite foreign keys (`[tenantId, externalId]` in references clause)
- `onDelete`/`onUpdate` referential actions
- Composite unique constraints (`@@unique`)
- Any array or structured form for `foreignKey` or `through`

---

#### B. IR Investigation

**IR Schema file**: `C:\Projects\Manifest\docs\spec\ir\ir-v1.schema.json`

**IRRelationship shape from schema (lines 150-160):**
```json
"IRRelationship": {
  "type": "object",
  "additionalProperties": false,
  "required": ["name", "kind", "target"],
  "properties": {
    "name": { "type": "string" },
    "kind": { "enum": ["hasMany", "hasOne", "belongsTo", "ref"] },
    "target": { "type": "string" },
    "foreignKey": { "type": "string" },  // <-- SINGLE string
    "through": { "type": "string" }       // <-- SINGLE string
  }
}
```

**IRProperty shape from schema (lines 131-136):**
```json
"IRProperty": {
  "type": "object",
  "required": ["name", "type", "modifiers"],
  "properties": {
    "name": { "type": "string" },
    "type": { "$ref": "#/definitions/IRType" },
    "defaultValue": { "$ref": "#/definitions/IRValue" },
    "modifiers": {
      "type": "array",
      "items": { "enum": ["required", "unique", "indexed", "private", "readonly", "optional"] }
    }
  }
}
```

**3 representative entities analyzed:**

1. `02-relationships.ir.json` — simple hasMany/belongsTo, no composite keys
2. `20-blog-app.ir.json` — FK expressed as regular property (`authorId`), not via relationship node; workaround pattern
3. `library.ir.json` (step3-demo) — hasMany through, hasOne, ref; join table `AuthorTag` with single-field PK

**Key IR finding**: `foreignKey` is always a single optional string — no array, no structured form. `through` is also single string.

---

#### C. Projection Investigation

**File**: `.claude/worktrees/nostalgic-villani-94af8e/src/manifest/projections/prisma/generator.ts`

**Hardcoded `references: [id]` (line 480):**
```typescript
lines.push(`  ${rel.name} ${rel.target} @relation(fields: [${fkName}], references: [id])`);
```

**Foreign Key Resolution (lines 450-454):**
```typescript
const fkName = options.foreignKeys?.[entity.name]?.[rel.name]
  ?? rel.foreignKey
  ?? `${rel.name}Id`;
```

**@id handling (lines 166, 522-543):**
- Line 166: `const isId = prop.name === 'id';`
- Line 172: `if (isId) attrs.push('@id');`
- Lines 533-543: Diagnostic when no `id` property found

**No composite key handling anywhere.**

**No onDelete/onUpdate handling anywhere.**

**Projection interface** (`src/manifest/projections/interface.ts`):
- `ProjectionTarget.generate(ir: IR, request: ProjectionRequest): ProjectionResult`
- `ProjectionResult` returns `artifacts[]` and `diagnostics[]`

**Note**: The `through` relation emits a comment `// PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED` in generated schema — the join table model is emitted but the relation line in parent is commented out.

---

#### D. foreignKey Blast Radius (21 sites)

**CATEGORY: IR/Core (7 sites)**
| File | Line | Usage |
|------|------|-------|
| `src/manifest/ir.ts` | 83 | Type definition: `foreignKey?: string` |
| `src/manifest/ir.d.ts` | 63 | Type definition: `foreignKey?: string` |
| `src/manifest/types.ts` | 73 | Type definition: `foreignKey?: string` |
| `src/manifest/ir-compiler.ts` | 323 | Passes through: `foreignKey: r.foreignKey` |
| `src/manifest/parser.ts` | 268-271 | Parses from 'with' clause |
| `src/manifest/parser.test.ts` | 148 | Test assertion for foreignKey |
| `src/manifest/ir-compiler.test.ts` | 1279 | Test assertion for foreignKey |

**CATEGORY: Runtime (5 sites)**
| File | Line | Usage |
|------|------|-------|
| `src/manifest/runtime-engine.ts` | 418 | Type in relationship index |
| `src/manifest/runtime-engine.ts` | 542 | Copies to relationshipIndex |
| `src/manifest/runtime-engine.ts` | 595 | Reads for belongsTo/ref FK resolution |
| `src/manifest/runtime-engine.ts` | 622 | Reads for hasOne inverse FK resolution |
| `src/manifest/runtime-engine.ts` | 649 | Reads for hasMany inverse FK resolution |

**CATEGORY: Projection (4 sites)**
| File | Line | Usage |
|------|------|-------|
| `...prisma/generator.ts` | 450-453 | Reads as tertiary fallback |
| `...prisma/options.ts` | 107 | Config option foreignKeys override |
| `...prisma/options.ts` | 98, 102 | Documentation for foreignKeys |
| `...prisma/generator.test.ts` | 700-763 | Three tests for foreignKey handling |

**CATEGORY: Artifacts/Tooling (5 sites)**
| File | Line | Usage |
|------|------|-------|
| `src/artifacts/zipExporter.ts` | 215 | IRRelationship type definition |
| `src/artifacts/zipExporter.ts` | 750-753 | Parses foreignKey |
| `src/project-template/templates.ts` | 1571 | IRRelationship type definition |
| `src/project-template/templates.ts` | 1779 | Copies foreignKey through |
| `docs/spec/ir/ir-v1.schema.json` | 158 | JSON schema: `foreignKey: { type: string }` |

---

#### E. Full Gap List

1. **Composite Primary Key** — No grammar syntax, no IR field. Real Prisma schema uses `@@id([tenantId, id])`.
2. **Composite Foreign Key** — No grammar syntax, `foreignKey` is single string. Real schema uses `fields: [tenantId, x]` in @relation.
3. **Non-id references target** — `references: [id]` hardcoded. Should be able to reference `references: [tenantId]` or any other PK column.
4. **onDelete referential action** — No grammar/IR for cascade, restrict, set null, etc.
5. **onUpdate referential action** — No grammar/IR for cascade, restrict, set null, etc.
6. **Composite unique constraint** — `@@unique([tenantId, externalId])` not expressible.
7. **Named indexes** — `@@index([tenantId, ...])` not expressible.
8. **`through` join table composite key** — The AuthorTag join table uses single `id` PK instead of `@@id([authorId, tagId])`.
9. **`through` relation not fully wired** — Comment in generated schema: `// PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED`

---

#### F. Classification

**SEMANTIC-CORE** (must go into grammar + IR):
- Composite PK `@@id([...])` — entity identity semantics
- Composite FK (structured `foreignKey` with local+remote columns)
- Non-id `references` target — domain-level referential intent; also required because Prisma rejects FK pointing at non-unique column
- onDelete referential action — semantic (cascade vs restrict vs set null)
- onUpdate referential action — semantic
- `@@unique` that backs a composite-key or non-id reference relationship — alternate identity / domain uniqueness rule, NOT storage tuning (user correction: split was inconsistent with composite PK classification)
- `through` join table composite key `@@id([authorId, tagId])` — domain meaning of join identity

**PROJECTION-CONFIG** (relational detail, not core):
- `@@unique` for pure business-key uniqueness (not relationship-backing)
- `@@index` — performance tuning, raw DDL
- Concrete column names, `@map`, decimal precision

**DEFERRED** (not this 1.0 wave):
- Item 9: `through` wiring bug (`// PRISMA_RELATION_VIA_THROUGH_UNIMPLEMENTED`) — pre-existing bug, isolated to separate follow-up task to keep Phase 5 diff clean

---

## Design Decisions

## Checkpoint Reports

### CHECKPOINT 1 — Grammar + IR Design (APPROVED SCOPE)

#### Grammar Surface (approved scope)

**Current relationship syntax:**
```
hasMany books: Book
hasMany tags: Tag through AuthorTag
belongsTo author: Author with authorId
ref createdBy: Actor
```

**NEW syntax (7 cases, corrected):**

**1. Composite FK (full explicit):**
```
belongsTo org: Organization fields [tenantId, orgId] references [tenantId, id]
```
`fields` = local columns. `references` = remote columns. Both required arrays.

**2. Single-column FK (fields specified, references omitted):**
```
belongsTo author: Author fields [authorId]   // local col = authorId, remote col = id (default)
```
`fields [single]` with no `references` → remote defaults to `id`. Backward-compatible via the `with` shorthand: `belongsTo author: Author with authorId` parses as `fields [authorId]` (no explicit `references`).

**3. Single-column FK (references only, no fields — local inferred from relation name):**
```
belongsTo org: Organization references [orgId]   // remote=[orgId], local=orgId (relName + "Id")
belongsTo author: Author references [id]       // remote=[id],   local=authorId (relName + "Id")
```
`references [single]` without `fields` → remote=`[single]`, local=`{relName}Id` (relation name + "Id"). Both must be single-element; `references [col1, col2]` with no `fields` is a **parse error** (composite refs require explicit `fields`).

**4. Non-id remote target (composite or single):**
```
belongsTo org: Organization references [tenantId]           // remote = [tenantId] (single non-PK col)
belongsTo parent: Entry references [tenantId, entryId]     // remote = [tenantId, entryId] (alternate key)
```
`references [...]` always means remote/target columns. `fields` is required for composite; optional for single-column (defaults to `{relName}Id`).

**5. Referential actions:**
```
belongsTo author: Author with authorId onDelete cascade onUpdate restrict
belongsTo org: Organization references [orgId] onDelete setNull onUpdate cascade
```
Actions: `cascade`, `restrict`, `setNull`, `setDefault`, `noAction`. Absent = emit nothing (let Prisma default). This ensures a relation with no action declared diffs clean against a real-schema relation that also has none.

**6. Composite PK on entity:**
```
entity Order {
  key [tenantId, orderId]   // declares these properties form the composite PK
  property tenantId: string required
  property orderId: string required
  ...
}
```
`key [...]` on entity → IREntity.key field → projection emits `@@id([tenantId, orderId])`.

**7. Non-PK alternate key (for non-PK references targets):**
```
entity Organization {
  key [tenantId, id]           // primary key = [tenantId, id]
  unique [tenantId, externalId]  // alternate key, backs non-PK FK references
  ...
}
```
`unique [...]` on entity → IREntity.alternateKeys field → projection emits `@@unique([tenantId, externalId])` on the target entity. Required because: when a FK's `references` doesn't point at the target's PK (e.g., references `[tenantId, externalId]` but PK is `[tenantId, id]`), Prisma rejects the relation without an explicit `@@unique` on those columns. Core carries the alternate-key declaration; projection emits it.

---

**Parser changes needed:**
- `parseRelationship()`: accept `fields [...]` (array), `references [...]` (array, required if `fields` present), `onDelete <action>`, `onUpdate <action>`. `with <single>` still works as backward-compat shorthand parsed as `fields [name]`.
- `parseEntity()`: accept `key [<id>, ...]` and `unique [<id>, ...]` before properties.

---

#### IR Shape

**IRRelationship before (single string):**
```typescript
foreignKey?: string
through?: string
```

**IRRelationship after (structured):**
```typescript
foreignKey?: {
  fields: string[];       // local columns (required when foreignKey is present)
  references: string[];  // remote/target columns (required when foreignKey is present)
}
through?: string;         // join table name (mutually exclusive with foreignKey — see invariant below)
onDelete?: 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';
onUpdate?: 'cascade' | 'restrict' | 'setNull' | 'setDefault' | 'noAction';
```

**Invariant (state explicitly):** `foreignKey` and `through` are **mutually exclusive** on any relationship.
- `hasMany ... through X` → `through` is set, `foreignKey` is absent (join table owns the FK)
- `belongsTo ... with X` / `fields [...] references [...]` → `foreignKey` is set, `through` is absent
- `ref` → neither `foreignKey` nor `through` (loose reference, no FK enforcement)

**Canonical IR for `with authorId` (backward compat, single-column):**
```typescript
// Parses as: fields [authorId] (no explicit references)
// IR stores:
{ fields: ["authorId"] }   // references ABSENT — projection defaults to ["id"]
// NOT { fields: ["authorId"], references: ["id"] }
// This is consistent with "absent = emit-nothing/let-default" pattern used for onDelete/onUpdate
```
Projection rule: when `foreignKey` is present but `references` is absent, default `references` to `["id"]`. Single-column round-trips identically — the projection always resolves to `references: [id]` in the emitted Prisma.

**onDelete/onUpdate semantics:**
- Absent (field undefined) = emit nothing; let Prisma use its default. This means a relation with no action declared diffs clean against a real-schema relation that also has none — critical for Phase 5 round-trip verification against the 53 relations currently missing onDelete.
- Present with value = emit the explicit action.

**IREntity new fields:**
```typescript
key?: string[];              // composite PK: e.g., ["tenantId", "id"]
alternateKeys?: string[][];   // alternate unique constraints for non-PK FK targets: e.g., [["tenantId", "externalId"], ["tenantId", "slug"]]
```

**JSON schema update (ir-v1.schema.json) — single block:**
- `foreignKey: { type: string }` → structured object:
  ```json
  "foreignKey": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "fields": { "type": "array", "items": { "type": "string" } },
      "references": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["fields", "references"]
  }
  ```
- Add `onDelete?: string` and `onUpdate?: string` to IRRelationship (enum: cascade|restrict|setNull|setDefault|noAction)
- Add `key?: { type: "array", items: { type: "string" } }` to IREntity
- Add `alternateKeys?: { type: "array", items: { type: "array", items: { type: "string" } } }` to IREntity (array of column-lists)

---

#### Projection Config Boundary

- `@map`, decimal precision → projection config (not core)
- `@@unique` for non-relationship-backing → projection config

**How alternate-key `@@unique` works (the case that caused the blocker):**

Target entity `Organization` has:
- PK: `key [tenantId, id]` → Prisma emits `@@id([tenantId, id])`
- Alternate key: `unique [tenantId, externalId]` → Prisma emits `@@unique([tenantId, externalId])`

FK relation: `belongsTo org: Organization references [tenantId, externalId]`

1. Core: the `references` array `[tenantId, externalId]` does NOT match the target's `key` (which is `[tenantId, id]`). This signals an alternate-key reference.
2. Projection: detects that `references` is not the target's primary key, looks up the target's `alternateKeys`, finds `[tenantId, externalId]` present, and emits `@@unique([tenantId, externalId])` on Organization.
3. The `@relation` in the FK entity emits `references: [tenantId, externalId]` — Prisma accepts it because the target has `@@unique` on those columns.

**Round-trip example — references alternate key, not PK:**

```manifest
entity Organization {
  key [tenantId, id]
  unique [tenantId, externalId]
  property tenantId: string required
  property id: string required
  property externalId: string required
}

entity Order {
  property tenantId: string required
  property orderId: string required
  property orgTenantId: string required
  property orgExternalId: string required
  belongsTo org: Organization references [orgTenantId, orgExternalId]
}
```

**Emitted Prisma:**
```prisma
model Organization {
  tenantId    String
  id          String
  externalId  String
  @@id([tenantId, id])
  @@unique([tenantId, externalId])
}

model Order {
  tenantId       String
  orderId        String
  orgTenantId    String
  orgExternalId  String
  org            Organization @relation(fields: [orgTenantId, orgExternalId], references: [tenantId, externalId])
  @@id([tenantId, orderId])
}
```

Prisma accepts: `references: [tenantId, externalId]` is backed by `@@unique([tenantId, externalId])` on Organization. Round-trip is legal and complete.

---

#### Migration Story (Phase 4)

All 21 foreignKey readers must migrate. Each gets test for single-column (1-element array) and composite (n-element array). The key migration rule: `rel.foreignKey` is now an object `{ fields, references }` not a string. Readers that previously did `rel.foreignKey ?? \`${rel.name}Id\`` now do `rel.foreignKey?.fields[0] ?? \`${rel.name}Id\``.

---

### CHECKPOINT 2
[TBD]

### CHECKPOINT 3
[TBD]

### CHECKPOINT 4
[TBD]

### CHECKPOINT 5 (Final)
[TBD]