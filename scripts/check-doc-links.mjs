#!/usr/bin/env node
/**
 * check-doc-links
 *
 * Verifies that every internal (relative or root-anchored) markdown link
 * in user-facing docs resolves to a real file in the repo. Anchors
 * (#section) are ignored — we don't yet build the doc to enumerate
 * headings, and false-positives on those would be noisier than the
 * signal.
 *
 * Out of scope:
 *   - External http(s) links (we don't want to make the CI gate depend
 *     on third-party availability).
 *   - mailto/tel/data URIs.
 *
 * Scope:
 *   - docs/**.md  (every markdown file under docs/)
 *   - mintlify/**.mdx
 *
 * Exit non-zero on any broken link so CI can gate on it. Output groups
 * by source file for triage.
 */
import { readFile, access } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';

const ROOT = process.cwd();

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

/**
 * Find every `[text](target)` markdown link in `src`. Returns
 * { target, line } pairs. We deliberately ignore reference-style and
 * autolink shorthands; the bulk of our docs use the inline form.
 */
function extractMarkdownLinks(src) {
  // We need both the link target AND the line number for legible
  // diagnostics. Tracking line numbers manually as we scan.
  const out = [];
  const lines = src.split('\n');
  // Negative lookbehind avoids matching image links `![alt](src)`.
  const linkRe = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  // Skip code fences (very rough — track triple-backtick state).
  // Not perfect, but fences inside links are vanishingly rare.
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      out.push({ target: m[1].trim(), line: i + 1 });
    }
  }
  return out;
}

/**
 * Classify a link target into one of:
 *   - 'external'  — http(s), mailto, tel, data, anchor-only (#foo)
 *   - 'internal'  — repo-relative path (with optional ?query or #anchor)
 *
 * Returns the path-only portion for internal links (anchor stripped).
 */
function classifyTarget(target) {
  if (!target) return { kind: 'external' };
  if (/^([a-z][a-z0-9+.-]*:)/i.test(target)) return { kind: 'external' };
  if (target.startsWith('#')) return { kind: 'external' }; // anchor-only
  // Strip query+anchor — we only resolve the path portion
  const pathOnly = target.split('#')[0].split('?')[0];
  if (!pathOnly) return { kind: 'external' }; // pure-anchor link
  return { kind: 'internal', path: pathOnly };
}

/**
 * Resolve an internal link to an absolute repo path. Internal links may
 * be relative to the source file, or root-anchored with a leading `/`
 * (Mintlify convention — `/cli/configuration` etc.).
 *
 * For Mintlify-style paths without an extension we try a small set of
 * candidate extensions before declaring a miss.
 */
async function resolveInternal(sourceFile, target) {
  const candidates = [];
  if (target.startsWith('/')) {
    // Root-anchored — Mintlify convention. Try under mintlify/ and the
    // repo root. Add common doc extensions.
    const base = target.slice(1);
    for (const root of ['mintlify', '']) {
      for (const ext of ['', '.md', '.mdx', '/index.md', '/index.mdx']) {
        candidates.push(path.join(ROOT, root, base + ext));
      }
    }
  } else {
    // Relative to the source file's directory.
    const dir = path.dirname(sourceFile);
    for (const ext of ['', '.md', '.mdx', '/index.md', '/index.mdx']) {
      candidates.push(path.resolve(dir, target + ext));
    }
  }
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch {
      // not this one
    }
  }
  return null;
}

async function checkFile(file) {
  const src = await readFile(file, 'utf-8');
  const links = extractMarkdownLinks(src);
  const broken = [];
  for (const { target, line } of links) {
    const cls = classifyTarget(target);
    if (cls.kind !== 'internal') continue;
    const resolved = await resolveInternal(file, cls.path);
    if (!resolved) broken.push({ target, line });
  }
  return broken;
}

async function main() {
  const files = await glob(['docs/**/*.md', 'mintlify/**/*.{md,mdx}'], {
    cwd: ROOT,
    nodir: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      // Meta-documentation about the docs site itself — not part of
      // the published nav, so links inside aren't required to resolve.
      'mintlify/README.md',
      'mintlify/CONTRIBUTING.md',
      // Historical archives are kept for reference but their internal
      // links may target since-deleted material.
      'docs/archive/**',
    ],
  });

  let totalLinks = 0;
  let totalBroken = 0;
  const failures = [];
  for (const rel of files) {
    const full = path.join(ROOT, rel);
    const broken = await checkFile(full);
    if (broken.length) {
      totalBroken += broken.length;
      failures.push({ file: rel, broken });
    }
    // Count links from src for the OK summary line.
    const src = await readFile(full, 'utf-8');
    totalLinks += extractMarkdownLinks(src).filter(
      (l) => classifyTarget(l.target).kind === 'internal',
    ).length;
  }

  if (totalBroken === 0) {
    console.log(
      `check-doc-links: OK (${totalLinks} internal link(s) across ${files.length} file(s))`,
    );
    return;
  }

  console.error(`check-doc-links: ${totalBroken} broken link(s) in ${failures.length} file(s)`);
  for (const f of failures) {
    console.error(`\n${f.file}:`);
    for (const b of f.broken) {
      console.error(`  line ${b.line}: ${b.target}`);
    }
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('check-doc-links crashed:', err);
  process.exit(2);
});

// Suppress unused warning for rel helper exposed for external tooling
void rel;
