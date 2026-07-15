#!/usr/bin/env node
/**
 * check-doc-snippets
 *
 * Compiles every ```manifest fenced code block in user-facing docs with the
 * REAL compiler (src/manifest/ir-compiler.ts, loaded via jiti — the same
 * no-build strategy as the CLI bin). Docs that show Manifest source must
 * actually compile; this gate exists because the 2026-07-01 audit found the
 * quickstart's first example used syntax that does not exist.
 *
 * TypeScript fences (```typescript / ```ts) are also gated when annotated:
 *   ```typescript check     must transpile (typescript.transpileModule)
 *   ```typescript invalid   must FAIL to transpile
 *   ```typescript fragment  skipped (partial snippet)
 *   ```typescript           skipped by default (legacy; migrate to `check`)
 *
 * Fence annotations (info string after the language, space-separated):
 *   ```manifest            must compile with zero error-severity diagnostics
 *   ```manifest fragment   skipped — partial snippet that is not a standalone
 *                          program (lone command body, `use "./x"` imports, …)
 *   ```manifest invalid    must FAIL to compile — the page is demonstrating a
 *                          compile error. If it starts compiling, the doc is
 *                          stale and this gate fails.
 *
 * Scope: mintlify/** (the published site) plus the user-facing docs/ dirs.
 * docs/internal (archives, proposals) and docs/spec (normative grammar
 * fragments) are out of scope for now.
 *
 * Exit non-zero on any violation so CI can gate on it.
 */
import { readFile } from 'node:fs/promises';
import { glob } from 'glob';
import path from 'node:path';
import { createJiti } from 'jiti';
import ts from 'typescript';

const ROOT = process.cwd();

const SCOPE = [
  'mintlify/**/*.{md,mdx}',
  'docs/features/**/*.md',
  'docs/getting-started/**/*.md',
  'docs/guides/**/*.md',
  'docs/projections/**/*.md',
  'docs/reference/**/*.md',
  'docs/FEATURE-LIST.md',
  'docs/README.md',
];

const IGNORE = ['**/node_modules/**', 'mintlify/README.md', 'mintlify/CONTRIBUTING.md'];

/**
 * Extract fenced code blocks for the given language tags (e.g. 'manifest' or
 * 'typescript'/'ts'). Tracks fence state so nested content is ignored.
 */
function extractFencedBlocks(src, languages) {
  const langSet = new Set(languages);
  const blocks = [];
  const lines = src.split('\n');
  let inFence = false;
  let fenceInfo = null;
  let fenceStart = 0;
  let body = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (!inFence && open) {
      inFence = true;
      fenceInfo = open[2].trim();
      fenceStart = i + 1;
      body = [];
      continue;
    }
    if (inFence && open && open[2].trim() === '') {
      const info = fenceInfo.split(/\s+/).filter(Boolean);
      const lang = (info[0] || '').toLowerCase();
      if (langSet.has(lang)) {
        blocks.push({
          lang,
          line: fenceStart,
          annotation: info.slice(1).join(' '),
          code: body.join('\n'),
        });
      }
      inFence = false;
      fenceInfo = null;
      continue;
    }
    if (inFence) body.push(line);
  }
  return blocks;
}

function transpileTypeScript(code) {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    },
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  return diagnostics.map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const line =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : undefined;
    return { message, line };
  });
}

async function main() {
  const jiti = createJiti(import.meta.url);
  const { compileToIR } = await jiti.import(path.join(ROOT, 'src/manifest/ir-compiler.ts'));

  const files = await glob(SCOPE, { cwd: ROOT, nodir: true, ignore: IGNORE });
  files.sort();

  let checkedManifest = 0;
  let checkedTs = 0;
  let skipped = 0;
  const failures = [];

  for (const rel of files) {
    // Normalize CRLF → LF: the fence regex's `$` won't match a line ending in
    // `\r`, so on a Windows checkout (autocrlf) CRLF files yield zero blocks and
    // silently pass. Normalize so local runs match CI's LF checkout.
    const src = (await readFile(path.join(ROOT, rel), 'utf-8')).replace(/\r\n/g, '\n');

    for (const block of extractFencedBlocks(src, ['manifest'])) {
      if (block.annotation.includes('fragment')) {
        skipped++;
        continue;
      }
      checkedManifest++;
      let errors = [];
      try {
        const result = await compileToIR(block.code, { useCache: false });
        errors = (result.diagnostics || []).filter((d) => d.severity === 'error');
        if (!result.ir && errors.length === 0) {
          errors = [{ message: 'compileToIR returned null IR with no error diagnostic' }];
        }
      } catch (e) {
        errors = [{ message: `compiler threw: ${e instanceof Error ? e.message : String(e)}` }];
      }

      const expectInvalid = block.annotation.includes('invalid');
      if (expectInvalid && errors.length === 0) {
        failures.push({
          file: rel,
          line: block.line,
          detail:
            'marked `invalid` but now compiles cleanly — the documented error no longer exists',
        });
      } else if (!expectInvalid && errors.length > 0) {
        failures.push({
          file: rel,
          line: block.line,
          detail: errors
            .slice(0, 3)
            .map((d) => d.message + (d.line ? ` (snippet line ${d.line})` : ''))
            .join(' | '),
        });
      }
    }

    for (const block of extractFencedBlocks(src, ['typescript', 'ts'])) {
      const ann = block.annotation;
      const wantsCheck = ann.includes('check');
      const expectInvalid = ann.includes('invalid');
      const isFragment = ann.includes('fragment');
      // Unannotated / fragment: skip (legacy inventory). Opt in with `check`.
      if (!wantsCheck && !expectInvalid) {
        skipped++;
        continue;
      }
      if (isFragment) {
        skipped++;
        continue;
      }

      checkedTs++;
      const errors = transpileTypeScript(block.code);
      if (expectInvalid && errors.length === 0) {
        failures.push({
          file: rel,
          line: block.line,
          detail:
            'marked `typescript invalid` but transpile succeeded — the documented error no longer exists',
        });
      } else if (!expectInvalid && errors.length > 0) {
        failures.push({
          file: rel,
          line: block.line,
          detail: errors
            .slice(0, 3)
            .map((d) => d.message + (d.line ? ` (snippet line ${d.line})` : ''))
            .join(' | '),
        });
      }
    }
  }

  if (failures.length === 0) {
    console.log(
      `check-doc-snippets: OK (${checkedManifest} manifest + ${checkedTs} typescript check/invalid snippet(s), ${skipped} skipped, ${files.length} file(s) scanned)`,
    );
    return;
  }

  console.error(
    `check-doc-snippets: ${failures.length} failing snippet(s) (${checkedManifest} manifest + ${checkedTs} ts checked, ${skipped} skipped)`,
  );
  let lastFile = null;
  for (const f of failures) {
    if (f.file !== lastFile) {
      console.error(`\n${f.file}:`);
      lastFile = f.file;
    }
    console.error(`  fence at line ${f.line}: ${f.detail}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('check-doc-snippets crashed:', err);
  process.exit(2);
});
