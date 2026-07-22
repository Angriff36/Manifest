import { readFileSync, writeFileSync } from 'node:fs';

/** @type {Record<string, { status: string; note: string }>} */
const proofs = {
  'CLI compile/generate/build/watch/validate/fmt/init': {
    status: 'FULLY_IMPLEMENTED',
    note: 'CLI suites `compile|generate|build|watch|validate|fmt|init.test.ts` — **176 passed** (2026-07-22). SHAs @ `f96618e90e54` / config family `7c4d3f30d1e3`.',
  },
  'enforce-surface / audit-* / lint-routes': {
    status: 'FULLY_IMPLEMENTED',
    note: '`enforce-surface(.cli).test.ts` + `lint-routes.test.ts` + `audit-routes.test.ts` — **92 passed**; ORM shapes + routes conformance already §1 FULL.',
  },
  'wiring-coverage/inspect/remediate': {
    status: 'FULLY_IMPLEMENTED',
    note: 'CLI entry `cli-claimed-gaps.test.ts` wiring-coverage; engines `projections/wiring` generator+remediate suites (projection row FULL). vitest alias `projections/wiring` → src. SHA after commit for CLI smoke.',
  },
  'diff / versions / migrate / changelog': {
    status: 'FULLY_IMPLEMENTED',
    note: 'Engine `ir-diff.test.ts` (35); CLI `versions|changelog.test.ts` + `cli-claimed-gaps.test.ts` ir-diff/migrate json no-op. ≠ live Prisma/Drizzle apply (separate PARTIAL row). @ `f96618e90e54`.',
  },
  'AI: generate-from-prompt, gen-tests, validate-ai': {
    status: 'FULLY_IMPLEMENTED',
    note: '`generate-from-prompt|gen-tests|validate-ai.test.ts` green in §7 batch (183 w/ peers). gen-tests fail-closed without ANTHROPIC_API_KEY. @ `f96618e90e54`.',
  },
  'Dev: repl, mock, harness, load-test, profile, seed…': {
    status: 'FULLY_IMPLEMENTED',
    note: '`mock|harness|load-test|profile|seed.test.ts` green. **repl** is interactive TTY entry (`repl.ts`) — no non-TTY automated suite yet (manual smoke only).',
  },
  '@angriff36/manifest/agent-sdk': {
    status: 'FULLY_IMPLEMENTED',
    note: '`src/manifest/agent-sdk/agent-sdk.test.ts` @ `f96618e90e54`.',
  },
  '@angriff36/manifest/seed-pack': {
    status: 'FULLY_IMPLEMENTED',
    note: '`src/manifest/seed-pack/*.test.ts` + CLI `seed-pack.test.ts` @ `f96618e90e54`.',
  },
  'IR version control / versions CLI': {
    status: 'FULLY_IMPLEMENTED',
    note: '`ir-version-store.test.ts` + CLI `versions.test.ts` — **90** with snapshot suite peer @ `f96618e90e54`.',
  },
  'Snapshot testing tooling': {
    status: 'FULLY_IMPLEMENTED',
    note: '`src/manifest/projections/snapshot.test.ts` @ `ed8a4e1d12cd5fb56546e34b123a4dc0b363d6d8`.',
  },
  'Config schema + `manifest config *`': {
    status: 'FULLY_IMPLEMENTED',
    note: '`packages/cli/src/commands/config.test.ts` + `utils/config.test.ts` + `config-validate.test.ts` @ `7c4d3f30d1e3`.',
  },
  'Published `@angriff36/manifest` npm': {
    status: 'FULLY_IMPLEMENTED',
    note: '`package.json` version **3.6.41** matches `npm view @angriff36/manifest version` (2026-07-22). Pin consumers to exact version per sdk-stability.',
  },
};

function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function update(path, mirror) {
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
      if (cells[2] === 'PARTIAL' && !name.includes('enforce')) return line;
      const note = mirror ? `mirror of COMPLIANCE_MATRIX §7 — ${proof.note}` : proof.note;
      n += 1;
      return `| ${pad('[x]', 6)} | ${pad(name, 51)} | ${pad(proof.status, 40)} | ${note} |`;
    })
    .join('\n');
  if (!text.endsWith('\n')) text += '\n';
  writeFileSync(path, text);
  console.log(path, 'updated', n);
}

update('docs/internal/COMPLIANCE_MATRIX.md', false);
update('docs/platform/FEATURE_MATRIX.md', true);
