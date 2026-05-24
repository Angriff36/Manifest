/**
 * Phase 5 — Round-trip verification.
 *
 * Constructs IR for 3 representative multi-tenant capsule-pro entities
 * (AdminChatParticipant, ProposalLineItem, PrepList) whose key structure
 * is known from the real Prisma schema, then runs the Prisma projection
 * and compares structural elements.
 *
 * Real schema source: packages/database/prisma/schema.prisma (capsule-pro)
 */

import type { IR, IREntity, IRStore } from './src/manifest/ir.js';
import { PrismaProjection } from './src/manifest/projections/prisma/generator.js';

// ---------------------------------------------------------------------------
// IR fixture — 5 representative entities
// ---------------------------------------------------------------------------

function makeIR(): IR {
  const entities: IREntity[] = [
    // Account — single-col PK (tenant root, referenced by all composite FKs)
    {
      name: 'Account',
      properties: [
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [],
      commands: [], constraints: [], policies: [],
    },

    // AdminChatThread — composite PK
    {
      name: 'AdminChatThread',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [
        { name: 'tenant', kind: 'belongsTo', target: 'Account', foreignKey: { fields: ['tenantId'] }, onDelete: 'restrict' },
        { name: 'participants', kind: 'hasMany', target: 'AdminChatParticipant' },
      ],
      commands: [], constraints: [], policies: [],
    },

    // User — composite PK
    {
      name: 'User',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [
        { name: 'tenant', kind: 'belongsTo', target: 'Account', foreignKey: { fields: ['tenantId'] }, onDelete: 'restrict' },
        { name: 'chatParticipants', kind: 'hasMany', target: 'AdminChatParticipant' },
      ],
      commands: [], constraints: [], policies: [],
    },

    // AdminChatParticipant — composite PK; 3 FKs (1 single, 2 composite); onDelete on all
    {
      name: 'AdminChatParticipant',
      key: ['tenantId', 'id'],
      alternateKeys: [['tenantId', 'threadId', 'userId']],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'threadId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'userId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'archivedAt', type: { name: 'datetime', nullable: true }, modifiers: [] },
      ],
      computedProperties: [],
      relationships: [
        {
          name: 'tenant',
          kind: 'belongsTo',
          target: 'Account',
          foreignKey: { fields: ['tenantId'] },
          onDelete: 'restrict',
        },
        {
          name: 'thread',
          kind: 'belongsTo',
          target: 'AdminChatThread',
          foreignKey: { fields: ['tenantId', 'threadId'], references: ['tenantId', 'id'] },
          onDelete: 'cascade',
        },
        {
          name: 'user',
          kind: 'belongsTo',
          target: 'User',
          foreignKey: { fields: ['tenantId', 'userId'], references: ['tenantId', 'id'] },
          onDelete: 'restrict',
        },
      ],
      commands: [], constraints: [], policies: [],
    },

    // Proposal — composite PK (referenced by ProposalLineItem)
    {
      name: 'Proposal',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [
        { name: 'tenant', kind: 'belongsTo', target: 'Account', foreignKey: { fields: ['tenantId'] }, onDelete: 'restrict' },
        { name: 'lineItems', kind: 'hasMany', target: 'ProposalLineItem' },
      ],
      commands: [], constraints: [], policies: [],
    },

    // ProposalLineItem — composite PK; 2 FKs (1 single Restrict, 1 composite Cascade)
    {
      name: 'ProposalLineItem',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'proposalId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'unitPrice', type: { name: 'money', nullable: false }, modifiers: ['required'] },
        { name: 'quantity', type: { name: 'decimal', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [
        {
          name: 'tenant',
          kind: 'belongsTo',
          target: 'Account',
          foreignKey: { fields: ['tenantId'] },
          onDelete: 'restrict',
        },
        {
          name: 'proposal',
          kind: 'belongsTo',
          target: 'Proposal',
          foreignKey: { fields: ['proposalId', 'tenantId'], references: ['id', 'tenantId'] },
          onDelete: 'cascade',
        },
      ],
      commands: [], constraints: [], policies: [],
    },

    // PrepList — composite PK; 1 FK (single-col Restrict)
    {
      name: 'PrepList',
      key: ['tenantId', 'id'],
      properties: [
        { name: 'tenantId', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'status', type: { name: 'string', nullable: false }, modifiers: ['required'] },
        { name: 'totalItems', type: { name: 'int', nullable: false }, modifiers: ['required'] },
      ],
      computedProperties: [],
      relationships: [
        {
          name: 'tenant',
          kind: 'belongsTo',
          target: 'Account',
          foreignKey: { fields: ['tenantId'] },
          onDelete: 'restrict',
        },
      ],
      commands: [], constraints: [], policies: [],
    },
  ];

  const stores: IRStore[] = entities.map((e) => ({ entity: e.name, target: 'durable', config: {} }));

  return {
    version: '1.0',
    provenance: {
      contentHash: 'phase5-verify',
      compilerVersion: 'phase5',
      schemaVersion: '1.0',
      compiledAt: '2026-05-24T00:00:00.000Z',
    },
    modules: [],
    entities,
    stores,
    events: [],
    commands: [],
    policies: [],
  };
}

// ---------------------------------------------------------------------------
// Run projection + structural diff
// ---------------------------------------------------------------------------

const ir = makeIR();
const result = new PrismaProjection().generate(ir, { surface: 'prisma.schema' });
const schema = result.artifacts[0].code;

console.log('=== GENERATED schema.prisma ===\n');
console.log(schema);

console.log('\n=== STRUCTURAL VERIFICATION ===\n');

// Check 1: composite PKs
const compositePkChecks = [
  ['AdminChatParticipant', '@@id([tenantId, id])'],
  ['AdminChatThread', '@@id([tenantId, id])'],
  ['User', '@@id([tenantId, id])'],
  ['Proposal', '@@id([tenantId, id])'],
  ['ProposalLineItem', '@@id([tenantId, id])'],
  ['PrepList', '@@id([tenantId, id])'],
];
console.log('--- Composite PKs (must match @@id([tenantId, id]) in real schema) ---');
for (const [entity, expected] of compositePkChecks) {
  const ok = schema.includes(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${entity}: ${expected}`);
}

// Check 2: alternate key
console.log('\n--- Alternate keys (@@unique) ---');
const altKey = '@@unique([tenantId, threadId, userId])';
console.log(`  ${schema.includes(altKey) ? 'PASS' : 'FAIL'} AdminChatParticipant: ${altKey}`);

// Check 3: composite FK @relation
console.log('\n--- Composite FK @relations ---');
const compositeFkChecks = [
  ['AdminChatParticipant.thread', '@relation(fields: [tenantId, threadId], references: [tenantId, id], onDelete: Cascade)'],
  ['AdminChatParticipant.user',   '@relation(fields: [tenantId, userId], references: [tenantId, id], onDelete: Restrict)'],
  ['ProposalLineItem.proposal',   '@relation(fields: [proposalId, tenantId], references: [id, tenantId], onDelete: Cascade)'],
];
for (const [entity, expected] of compositeFkChecks) {
  const ok = schema.includes(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${entity}: ${expected}`);
}

// Check 4: single-col FK with onDelete
console.log('\n--- Single-col FK with onDelete ---');
const singleFkChecks = [
  ['AdminChatParticipant.tenant', '@relation(fields: [tenantId], references: [id], onDelete: Restrict)'],
  ['ProposalLineItem.tenant',     '@relation(fields: [tenantId], references: [id], onDelete: Restrict)'],
  ['PrepList.tenant',             '@relation(fields: [tenantId], references: [id], onDelete: Restrict)'],
];
for (const [entity, expected] of singleFkChecks) {
  const ok = schema.includes(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${entity}: ${expected}`);
}

// Check 5: absent onDelete leaves clean @relation
console.log('\n--- Absent onDelete emits no attribute ---');
// Account entity has no FK and no onDelete
const accountModel = schema.match(/model Account \{[\s\S]*?\}/)?.[0] ?? '';
const noActionOnAccount = !accountModel.includes('onDelete');
console.log(`  ${noActionOnAccount ? 'PASS' : 'FAIL'} Account model has no onDelete (no FK)`);

// Check 6: diagnostics
const errors = result.diagnostics.filter((d) => d.severity === 'error');
console.log(`\n--- Diagnostics ---`);
console.log(`  Errors: ${errors.length}`);
if (errors.length > 0) {
  for (const e of errors) console.log(`  ERROR ${e.code} — ${e.entity}: ${e.message}`);
}
const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
console.log(`  Warnings: ${warnings.length}`);
if (warnings.length > 0) {
  for (const w of warnings) console.log(`  WARN ${w.code} — ${w.entity}: ${w.message}`);
}

console.log('\n=== KNOWN GAPS (deferred at CHECKPOINT 0) ===');
console.log('  1. @map("column_name") — PROJECTION-CONFIG, not in semantic core');
console.log('  2. @db.Uuid / @db.Timestamptz(6) / @db.Decimal type attributes — PROJECTION-CONFIG');
console.log('  3. @default(dbgenerated(...)) / @default(now()) — PROJECTION-CONFIG');
console.log('  4. @@schema("tenant_admin") — Prisma schema namespacing — PROJECTION-CONFIG');
console.log('  5. through (many-to-many join entity) — DEFERRED to separate follow-up task');
console.log('  6. 53 relations without onDelete: real schema declares them absent → projection');
console.log('     emits no onDelete (correct! absent-means-default pattern)');
