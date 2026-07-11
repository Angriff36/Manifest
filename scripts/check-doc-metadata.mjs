#!/usr/bin/env node
/**
 * check-doc-metadata
 *
 * Verifies that user-facing documentation files declare the required
 * YAML frontmatter we depend on for editor IntelliSense, Mintlify
 * navigation, and the docs site's SEO description. Files that are
 * intentionally generated-reference (the `docs/codedocs/` tree) are
 * audited for the AUTO-GENERATED REFERENCE banner instead.
 *
 * Scope:
 *   - docs/codedocs/**.md   require: AUTO-GENERATED REFERENCE banner
 *   - mintlify/**.mdx       require: title (Mintlify convention)
 *
 * Anything else under docs/ is skipped. The `docs/spec/` tree is
 * reference material for engineers (it's not rendered through Mintlify),
 * and `docs/archive/`, `docs/capsule-pro/`, etc. are explicitly out of
 * the public docs surface.
 *
 * Exit non-zero on any failure so CI can gate on it. Output is grouped
 * by failure kind for easy triage.
 */
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';

const ROOT = process.cwd();
const isWin = process.platform === 'win32';

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/**
 * Extract YAML frontmatter from the head of a markdown/MDX file. Returns
 * null when there's no frontmatter block (the very first line must be
 * `---`). We do a minimal `key: value` parser — that's enough for the
 * fields we audit and avoids dragging in a YAML dependency.
 */
function parseFrontmatter(src) {
  if (!src.startsWith('---')) return null;
  const end = src.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = src.slice(3, end).trim();
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([\w$-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    // strip matching quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function checkSpec(file) {
  const src = await readFile(file, 'utf-8');
  const fm = parseFrontmatter(src);
  const missing = [];
  if (!fm) {
    missing.push('no frontmatter block');
  } else {
    if (!fm.title) missing.push('title');
    if (!fm.description) missing.push('description');
  }
  return missing.length ? { file: rel(file), missing } : null;
}

async function checkMintlify(file) {
  const src = await readFile(file, 'utf-8');
  const fm = parseFrontmatter(src);
  const missing = [];
  if (!fm) missing.push('no frontmatter block');
  else if (!fm.title) missing.push('title');
  return missing.length ? { file: rel(file), missing } : null;
}

async function checkCodedoc(file) {
  const src = await readFile(file, 'utf-8');
  if (!src.includes('AUTO-GENERATED REFERENCE')) {
    return { file: rel(file), missing: ['AUTO-GENERATED REFERENCE banner'] };
  }
  return null;
}

async function runGroup(name, pattern, checker) {
  const matches = await glob(pattern, {
    cwd: ROOT,
    nodir: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });
  const failures = [];
  for (const m of matches) {
    const full = path.join(ROOT, m);
    const result = await checker(full);
    if (result) failures.push(result);
  }
  return { name, scanned: matches.length, failures };
}

async function main() {
  const groups = await Promise.all([
    runGroup('docs/codedocs', 'docs/codedocs/**/*.md', checkCodedoc),
    runGroup('mintlify', 'mintlify/**/*.mdx', checkMintlify),
  ]);
  // `checkSpec` is kept for callers that want stricter enforcement on
  // `docs/spec/` — wire it up by adding a group above. The default
  // config does not require frontmatter on spec docs.
  void checkSpec;

  let total = 0;
  let failed = 0;
  for (const g of groups) {
    total += g.scanned;
    failed += g.failures.length;
  }

  if (failed === 0) {
    console.log(
      `check-doc-metadata: OK (${total} files scanned across ${groups
        .map((g) => `${g.name}=${g.scanned}`)
        .join(', ')})`,
    );
    return;
  }

  console.error(`check-doc-metadata: ${failed} file(s) failed`);
  for (const g of groups) {
    if (g.failures.length === 0) continue;
    console.error(`\n${g.name} (${g.failures.length} of ${g.scanned}):`);
    for (const f of g.failures) {
      console.error(`  - ${f.file}: missing ${f.missing.join(', ')}`);
    }
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('check-doc-metadata crashed:', err);
  process.exit(2);
});
// Suppress unused-locals lint in non-TS context
void isWin;
