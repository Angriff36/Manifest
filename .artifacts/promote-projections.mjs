import { readFileSync, writeFileSync } from 'node:fs';

const proofs = {
  nextjs: {
    status: 'FULLY_IMPLEMENTED',
    note: 'proofs nextjs/generator + dispatcher/webhook/schedule/companions @ `3c10705ff78f`; batch 961 projection tests green 2026-07-22',
  },
  routes: {
    status: 'FULLY_IMPLEMENTED',
    note: 'routes/generator.test.ts + routes.conformance.test.ts @ `5290df259a44`',
  },
  prisma: {
    status: 'FULLY_IMPLEMENTED',
    note: 'prisma/generator.test.ts @ `cf5be82e0fea`',
  },
  'prisma-store': {
    status: 'FULLY_IMPLEMENTED',
    note: 'prisma-store/generator.test.ts (6) @ `d6d42fc865e4`; softDelete = projection config only',
  },
  openapi: {
    status: 'FULLY_IMPLEMENTED',
    note: 'openapi/generator.test.ts (43) @ `0a2ee5d39ed38c`',
  },
  'react-query': {
    status: 'FULLY_IMPLEMENTED',
    note: 'react-query/generator.test.ts (34) @ `f5b2f4cd11a3`',
  },
  zod: {
    status: 'FULLY_IMPLEMENTED',
    note: 'zod/generator.test.ts (50) @ `31c780fecdb6`',
  },
  drizzle: {
    status: 'FULLY_IMPLEMENTED',
    note: 'drizzle/generator.test.ts (57) @ `99c2249589cd`',
  },
  graphql: {
    status: 'FULLY_IMPLEMENTED',
    note: 'graphql/generator.test.ts (41) @ `e3000a414b44`',
  },
  'llm-context': {
    status: 'FULLY_IMPLEMENTED',
    note: 'llm-context/generator.test.ts (38) @ `fb6e9252be79`',
  },
  express: {
    status: 'FULLY_IMPLEMENTED',
    note: 'express companions+webhooks @ `5d83d8d47018`; authProvider §1',
  },
  hono: {
    status: 'FULLY_IMPLEMENTED',
    note: 'hono companions+webhooks @ `5d83d8d47018`; authProvider §1',
  },
  mermaid: {
    status: 'FULLY_IMPLEMENTED',
    note: 'mermaid/mermaid.test.ts (21) @ `fb6e9252be79`',
  },
  jsonschema: {
    status: 'FULLY_IMPLEMENTED',
    note: 'jsonschema/generator.test.ts (1) @ `52fbcda4397f`',
  },
  storybook: {
    status: 'FULLY_IMPLEMENTED',
    note: 'storybook/generator.test.ts (24) @ `83e6c4f66ed1`',
  },
  elasticsearch: {
    status: 'FULLY_IMPLEMENTED',
    note: 'elasticsearch/generator.test.ts (24) @ `9f3a9bfaed21`',
  },
  terraform: {
    status: 'FULLY_IMPLEMENTED',
    note: 'terraform/generator.test.ts (25) @ `9f3a9bfaed21`',
  },
  analytics: {
    status: 'FULLY_IMPLEMENTED',
    note: 'analytics/generator.test.ts (26) @ `9f3a9bfaed21`',
  },
  remix: {
    status: 'FULLY_IMPLEMENTED',
    note: 'remix/companions.test.ts @ `5d83d8d47018`',
  },
  sveltekit: {
    status: 'FULLY_IMPLEMENTED',
    note: 'sveltekit/generator.test.ts (40) @ `9f3a9bfaed21`',
  },
  kysely: {
    status: 'FULLY_IMPLEMENTED',
    note: 'kysely generator+options+column-mappings @ `59dd2eb16d30`',
  },
  'dynamodb (projection)': {
    status: 'FULLY_IMPLEMENTED',
    note: 'dynamodb/generator.test.ts (9) @ `9f3a9bfaed21`; ≠ entity DynamoDBStore',
  },
  pydantic: {
    status: 'FULLY_IMPLEMENTED',
    note: 'pydantic/generator.test.ts (19) @ `9f3a9bfaed21`',
  },
  dart: {
    status: 'FULLY_IMPLEMENTED',
    note: 'dart/generator.test.ts (24) + verify.test.ts @ `9f3a9bfaed21`',
  },
  wiring: {
    status: 'FULLY_IMPLEMENTED',
    note: 'wiring/generator.test.ts + remediate suites @ `971df066351f`',
  },
  'contract-tests': {
    status: 'FULLY_IMPLEMENTED',
    note: 'contract-tests/generator.test.ts (4) @ `0c8c54d4abc5`; export-name suites only',
  },
};

function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function update(path) {
  const mirror = path.includes('FEATURE_MATRIX');
  let text = readFileSync(path, 'utf8');
  let n = 0;
  text = text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith('|')) return line;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 3 || !/^\[[ x~]\]$/.test(cells[0])) return line;
      const name = cells[1];
      const proof = proofs[name];
      if (!proof) return line;
      // Always refresh CLAIMED / stale FULLY rows we own in this promote set.
      if (cells[2] === 'PARTIAL' || cells[2] === 'DIAGNOSTIC_ONLY') return line;
      const note = mirror ? `mirror of COMPLIANCE_MATRIX §6 — ${proof.note}` : proof.note;
      n += 1;
      return `| ${pad('[x]', 6)} | ${pad(name, 21)} | ${pad(proof.status, 28)} | ${note} |`;
    })
    .join('\n');
  if (!text.endsWith('\n')) text += '\n';
  writeFileSync(path, text);
  console.log(path, 'updated', n, 'rows');
}

update('docs/internal/COMPLIANCE_MATRIX.md');
update('docs/platform/FEATURE_MATRIX.md');
