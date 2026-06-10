#!/usr/bin/env node
/**
 * Ensure CHANGELOG.md has a section for <version>. When missing, insert a
 * stub generated from a commit-subject list (one "- subject" per line) so
 * the release-notes extraction can never fail.
 *
 * Usage: node tools/release/ensure-changelog-section.mjs <major.minor.patch> [commits-file]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
const commitsFile = process.argv[3];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node tools/release/ensure-changelog-section.mjs <major.minor.patch> [commits-file]');
  process.exit(1);
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const content = fs.readFileSync(changelogPath, 'utf8');
const header = `## [${version}]`;

if (content.includes(header)) {
  console.log(`CHANGELOG.md already has a section for ${version} — leaving it untouched.`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
let body = '_Auto-generated stub — expand with real release notes._';
if (commitsFile && fs.existsSync(commitsFile)) {
  const commits = fs.readFileSync(commitsFile, 'utf8').trim();
  if (commits) {
    body = `### Changed\n\n${commits}`;
  }
}

const stub = `## [${version}] - ${today}\n\n${body}\n\n`;
const firstSection = content.search(/^## \[/m);
const updated =
  firstSection === -1
    ? `${content.trimEnd()}\n\n${stub}`
    : content.slice(0, firstSection) + stub + content.slice(firstSection);

fs.writeFileSync(changelogPath, updated);
console.log(`Inserted stub CHANGELOG section for ${version}.`);
