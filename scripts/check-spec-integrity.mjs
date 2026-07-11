#!/usr/bin/env node
/**
 * check-spec-integrity
 *
 * Verifies that every Tier-A spec doc under docs/spec/*.md carries the
 * three required plaintext header fields:
 *
 *   Last updated: YYYY-MM-DD
 *   Status:       Active | Draft | Deprecated | Superseded
 *   Authority:    Binding | Advisory
 *
 * These are not YAML frontmatter — spec docs use bare text headers so
 * they remain readable without a markdown parser. The check scans the
 * first 15 lines of each file for the field names.
 *
 * Also checks that every relative markdown link in docs/spec/*.md
 * resolves to a real file. (check-doc-links.mjs covers the full docs/
 * tree; this check adds an early, focused signal scoped to the spec
 * directory so spec authors get a clear failure message without noise
 * from the wider link check.)
 *
 * Exit non-zero on any failure.
 */
import { readFile, access } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';

const ROOT = process.cwd();

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

const REQUIRED_HEADERS = ['Last updated:', 'Status:', 'Authority:'];

/**
 * Check the first 15 lines for the three required plaintext headers.
 */
async function checkHeaders(file) {
  const src = await readFile(file, 'utf-8');
  const head = src.split('\n').slice(0, 15).join('\n');
  const missing = REQUIRED_HEADERS.filter((h) => !head.includes(h));
  return missing.length ? { file: rel(file), missing } : null;
}

/**
 * Extract relative markdown links from a file and verify they resolve.
 * Ignores http(s) links, anchors, and mailto/data URIs.
 */
function extractRelativeLinks(src) {
  const out = [];
  const lines = src.split('\n');
  const linkRe = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    let m;
    while ((m = linkRe.exec(lines[i])) !== null) {
      const target = m[1].trim().split('#')[0].split('?')[0];
      if (!target) continue;
      if (/^([a-z][a-z0-9+.-]*:)/i.test(target)) continue;
      out.push({ target, line: i + 1 });
    }
  }
  return out;
}

async function resolveLink(sourceFile, target) {
  const dir = path.dirname(sourceFile);
  const candidates = [
    path.resolve(dir, target),
    path.resolve(dir, target + '.md'),
    path.resolve(dir, target + '.json'),
    path.resolve(dir, target, 'index.md'),
  ];
  for (const c of candidates) {
    try {
      await access(c);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function checkLinks(file) {
  const src = await readFile(file, 'utf-8');
  const links = extractRelativeLinks(src);
  const broken = [];
  for (const { target, line } of links) {
    const ok = await resolveLink(file, target);
    if (!ok) broken.push({ target, line });
  }
  return broken.length ? { file: rel(file), broken } : null;
}

async function main() {
  const files = await glob('docs/spec/*.md', {
    cwd: ROOT,
    nodir: true,
    ignore: ['**/node_modules/**'],
  });

  if (files.length === 0) {
    console.error('check-spec-integrity: no files found under docs/spec/*.md');
    process.exit(2);
  }

  const headerResults = await Promise.all(files.map((f) => checkHeaders(path.join(ROOT, f))));
  const linkResults = await Promise.all(files.map((f) => checkLinks(path.join(ROOT, f))));

  const headerFailures = headerResults.filter(Boolean);
  const linkFailures = linkResults.filter(Boolean);

  const totalFailed = headerFailures.length + linkFailures.length;

  if (totalFailed === 0) {
    console.log(
      `check-spec-integrity: OK (${files.length} spec file(s) checked — headers and links clean)`,
    );
    return;
  }

  if (headerFailures.length > 0) {
    console.error(
      `\ncheck-spec-integrity: ${headerFailures.length} file(s) missing required headers`,
    );
    for (const f of headerFailures) {
      console.error(`  ${f.file}: missing — ${f.missing.join(', ')}`);
    }
  }

  if (linkFailures.length > 0) {
    console.error(`\ncheck-spec-integrity: ${linkFailures.length} file(s) with broken links`);
    for (const f of linkFailures) {
      for (const b of f.broken) {
        console.error(`  ${f.file} line ${b.line}: ${b.target}`);
      }
    }
  }

  process.exit(1);
}

main().catch((err) => {
  console.error('check-spec-integrity crashed:', err);
  process.exit(2);
});
