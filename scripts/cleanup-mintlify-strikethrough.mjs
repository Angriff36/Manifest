#!/usr/bin/env node
/**
 * One-pass cleanup: Mintlify public docs should show current truth only.
 * Removes obsolete ~~struck~~ claims and dated Correction banners, keeping
 * the verified corrected content. Does not edit docs/internal or CLAUDE law.
 *
 * Usage: node scripts/cleanup-mintlify-strikethrough.mjs [--dry-run]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MINTLIFY = join(ROOT, 'mintlify');
const DRY = process.argv.includes('--dry-run');

function walkMdx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMdx(p, out);
    else if (name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

function unwrapBlockquote(block) {
  return block
    .split('\n')
    .map((line) => {
      if (line.startsWith('> ')) return line.slice(2);
      if (line === '>') return '';
      return line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const CORRECTION_PREFIX =
  /^(?:\*\*)?(?:Correction|Verified)\s*\([^)]*\)(?:\s*@RYANSIGNED)?(?:\s*[—–-]\s*Documentation gap)?:(?:\*\*)?\s*/i;

function stripCorrectionPrefix(text) {
  return text.replace(CORRECTION_PREFIX, '').trim();
}

function isMetaOnlyCorrection(body) {
  return (
    /^The examples below have been corrected/i.test(body) ||
    /^examples below have been corrected/i.test(body)
  );
}

function stripInlineCorrectionMarker(line) {
  // After ~~old~~ is removed, leftover "**Correction (date) @RYANSIGNED:** rest"
  return line.replace(
    /\*\*Correction\s*\([^)]*\)(?:\s*@RYANSIGNED)?(?:\s*[—–-][^*]*)?:\*\*\s*/gi,
    '',
  );
}

function removeInlineStrikes(line) {
  let out = line.replace(
    /~~[^~\n]+~~\s*\*\*Correction\s*\([^)]*\)(?:\s*@RYANSIGNED)?(?:\s*[—–-][^*]*)?:\*\*\s*/gi,
    '',
  );
  out = out.replace(/~~[^~\n]+~~\s*→\s*/g, '');
  out = out.replace(/~~([^~\n]+)~~/g, '');
  out = stripInlineCorrectionMarker(out);
  return out;
}

function leadingIndent(line) {
  const m = line.match(/^[ \t]*/);
  return m ? m[0] : '';
}

function cleanupFile(source) {
  const report = { strikesRemoved: 0, correctionsUnwrapped: 0 };
  let text = source;

  // Struck fenced code: ~~```lang\n...\n```~~
  text = text.replace(/~~```[\w-]*\n[\s\S]*?\n```~~\n*/g, () => {
    report.strikesRemoved += 1;
    return '';
  });

  // Multi-line / single-line struck spans (non-fence). Only skip openings that
  // start a struck fence (~~```); ~~`code`~~ must still match.
  text = text.replace(/~~(?!```)([\s\S]*?)~~/g, (match, inner) => {
    // Allow inline `` ` ```lang ` `` mentions inside struck prose (whats-new).
    report.strikesRemoved += 1;
    return '';
  });

  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blockquote correction banners
    if (/^>\s*\*\*(?:Correction|Verified)\s*\(/i.test(line)) {
      const bq = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur.startsWith('>')) {
          bq.push(cur);
          i += 1;
          continue;
        }
        if (cur === '' && i + 1 < lines.length && lines[i + 1].startsWith('>')) {
          bq.push(cur);
          i += 1;
          continue;
        }
        break;
      }
      const body = stripCorrectionPrefix(unwrapBlockquote(bq.join('\n')));
      if (!isMetaOnlyCorrection(body) && body.length > 0) {
        report.correctionsUnwrapped += 1;
        if (out.length && out[out.length - 1] !== '') out.push('');
        out.push(...body.split('\n'));
        out.push('');
      } else {
        report.correctionsUnwrapped += 1;
      }
      continue;
    }

    // Indented / plain-paragraph correction banners (e.g. inside <Step>),
    // including split headers: **Correction (date)\n @RYANSIGNED:** body
    if (
      /^[ \t]*\*\*(?:Correction|Verified)\s*\(/i.test(line) ||
      (/^[ \t]*\*\*(?:Correction|Verified)\s*\([^)]*\)\s*$/i.test(line) &&
        i + 1 < lines.length &&
        /@RYANSIGNED:\*\*/i.test(lines[i + 1]))
    ) {
      const indent = leadingIndent(line);
      const chunk = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (chunk.length === 0) {
          chunk.push(cur);
          i += 1;
          continue;
        }
        if (cur === '') break;
        if (
          /^[ \t]*<\//.test(cur) ||
          /^[ \t]*<(?:Step|Note|Warning|Info|Tip|Card|CodeGroup|Accordion)/.test(cur)
        ) {
          break;
        }
        if (cur.startsWith(indent) || /^[ \t]*@RYANSIGNED/i.test(cur)) {
          chunk.push(cur);
          i += 1;
          continue;
        }
        break;
      }
      const raw = chunk
        .map((l) => l.replace(/^[ \t]*/, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\*\*\s*Correction/i, '**Correction')
        .replace(/\)\s*@RYANSIGNED:\*\*/i, ') @RYANSIGNED:**');
      let body = stripCorrectionPrefix(raw);
      // Drop "stale correction above" meta paragraphs when a Callout already states truth
      if (
        /correction above is \*\*stale\*\*/i.test(body) ||
        /correction above is stale/i.test(body)
      ) {
        report.correctionsUnwrapped += 1;
        continue;
      }
      if (!isMetaOnlyCorrection(body) && body.length > 0) {
        report.correctionsUnwrapped += 1;
        out.push(indent + body);
      } else {
        report.correctionsUnwrapped += 1;
      }
      continue;
    }

    // Blockquote notes that only carried @RYANSIGNED dating
    if (/^>\s*\*\*Note\s*\([^)]*\)\s*@RYANSIGNED:\*\*/i.test(line)) {
      const bq = [];
      while (
        i < lines.length &&
        (lines[i].startsWith('>') ||
          (lines[i] === '' && i + 1 < lines.length && lines[i + 1].startsWith('>')))
      ) {
        bq.push(lines[i]);
        i += 1;
      }
      const body = unwrapBlockquote(bq.join('\n')).replace(
        /^\*\*Note\s*\([^)]*\)\s*@RYANSIGNED:\*\*\s*/i,
        '',
      );
      report.correctionsUnwrapped += 1;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(`> **Note:** ${body}`);
      out.push('');
      continue;
    }

    let cleaned = removeInlineStrikes(line);
    // Parenthetical dating leftovers: (Correction 2026-07-15 @RYANSIGNED)
    cleaned = cleaned.replace(/\s*\(Correction\s+[^)]*@RYANSIGNED\)/gi, '');
    cleaned = cleaned.replace(/\s*@RYANSIGNED\b/g, '');
    // "use `cmd`" after arrow-cleanup at line start → "Use `cmd`"
    cleaned = cleaned.replace(/^([ \t]*)use (`)/, '$1Use $2');
    // Do not collapse interior spaces: markdown tables and ASCII trees rely on
    // padding. Strike removal already deletes ~~spans~~ without leaving doubles
    // in the common cases; remaining `.  ` gaps are acceptable.
    out.push(cleaned);
    i += 1;
  }

  text = out.join('\n');
  text = text.replace(/~~([^~\n]*)~~/g, () => {
    report.strikesRemoved += 1;
    return '';
  });
  // Trim trailing spaces only; never collapse interior padding (markdown tables).
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\n+$/, '\n');
  return { text, report };
}

export { cleanupFile };

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url).toLowerCase() === join(process.argv[1]).toLowerCase()
  : false;

if (isMain) {
  const all = walkMdx(MINTLIFY);
  let changed = 0;
  const summaries = [];

  for (const file of all) {
    const before = readFileSync(file, 'utf8');
    if (
      !before.includes('~~') &&
      !/Correction\s*\(20/i.test(before) &&
      !/@RYANSIGNED/.test(before)
    ) {
      continue;
    }
    const { text, report } = cleanupFile(before);
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (text !== before) {
      changed += 1;
      summaries.push({ rel, ...report, bytes: before.length - text.length });
      if (!DRY) writeFileSync(file, text, 'utf8');
    } else {
      summaries.push({ rel, ...report, bytes: 0, note: 'unchanged' });
    }
  }

  console.log(DRY ? 'DRY RUN' : 'WROTE');
  console.log(`filesChanged=${changed}`);
  for (const s of summaries.sort((a, b) => a.rel.localeCompare(b.rel))) {
    console.log(
      `${s.rel} strikes=${s.strikesRemoved} corrections=${s.correctionsUnwrapped} delta=${s.bytes}${s.note ? ' ' + s.note : ''}`,
    );
  }
}
