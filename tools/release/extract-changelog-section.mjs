#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section for a semver (e.g. 1.0.8).
 * Usage: node tools/release/extract-changelog-section.mjs 1.0.8
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node tools/release/extract-changelog-section.mjs <major.minor.patch>');
  process.exit(1);
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const content = fs.readFileSync(changelogPath, 'utf8');
const header = `## [${version}]`;
const start = content.indexOf(header);
if (start === -1) {
  console.error(`No changelog section found for ${version} in CHANGELOG.md`);
  process.exit(1);
}

const rest = content.slice(start + header.length);
const next = rest.search(/\n## \[/);
const section = next === -1 ? rest : rest.slice(0, next);
const dateMatch = section.match(/^\s*-\s*(\d{4}-\d{2}-\d{2})/);
const body = section.replace(/^\s*-\s*\d{4}-\d{2}-\d{2}\s*\n?/, '').trim();

const title = dateMatch
  ? `## ${version} (${dateMatch[1]})`
  : `## ${version}`;

process.stdout.write(`${title}\n\n${body}\n`);
