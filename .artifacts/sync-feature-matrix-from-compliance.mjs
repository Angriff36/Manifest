/**
 * Sync FEATURE_MATRIX.md §2 language rows that COMPLIANCE_MATRIX already marks
 * FULLY_IMPLEMENTED / REJECTED / OUT_OF_SCOPE — keeps FEATURE-LIST honest.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const compliancePath = 'docs/internal/COMPLIANCE_MATRIX.md';
const featurePath = 'docs/platform/FEATURE_MATRIX.md';

function parseRows(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((s) => s.trim());
    if (cells.length < 5) continue;
    const [, status, feature, impl, evidence] = cells;
    if (!feature || feature === 'Feature' || /^-+$/.test(feature)) continue;
    rows.push({ line, status, feature, impl, evidence });
  }
  return rows;
}

const compliance = parseRows(readFileSync(compliancePath, 'utf8'));
const byFeature = new Map();
for (const r of compliance) {
  // Prefer FULLY / REJECTED / OUT / REMOVED over CLAIMED when duplicate names exist
  const prev = byFeature.get(r.feature);
  const rank = (impl) =>
    impl.includes('FULLY_IMPLEMENTED') ||
    impl.includes('REJECTED') ||
    impl.includes('OUT_OF_SCOPE') ||
    impl.includes('REMOVED')
      ? 2
      : impl.includes('CLAIMED')
        ? 0
        : 1;
  if (!prev || rank(r.impl) > rank(prev.impl)) byFeature.set(r.feature, r);
}

let featureMd = readFileSync(featurePath, 'utf8');
const lines = featureMd.split(/\r?\n/);
let updated = 0;
const synced = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').map((s) => s.trim());
  if (cells.length < 5) continue;
  const feature = cells[2];
  const impl = cells[3];
  if (!feature || feature === 'Feature') continue;
  if (!impl.includes('CLAIMED_NEEDS_PROOF') && !impl.includes('PARTIAL')) continue;
  // Keep PARTIAL-only rows unless compliance is FULLY
  const src = byFeature.get(feature);
  if (!src) continue;
  if (
    !(
      src.impl.includes('FULLY_IMPLEMENTED') ||
      src.impl.includes('REJECTED') ||
      src.impl.includes('OUT_OF_SCOPE') ||
      src.impl.includes('REMOVED')
    )
  ) {
    continue;
  }
  // Don't upgrade PARTIAL capability rows that compliance still marks PARTIAL
  if (src.impl.includes('PARTIAL') && !src.impl.includes('FULLY_IMPLEMENTED')) continue;

  const shortEvidence = `mirror of COMPLIANCE_MATRIX — ${src.evidence.slice(0, 160)}${src.evidence.length > 160 ? '…' : ''}`;
  const newStatus = src.status.includes('x') ? '[x]' : src.status;
  // Rebuild with similar padding style (loose)
  lines[i] =
    `| ${newStatus.padEnd(6)} | ${feature.padEnd(116)} | ${src.impl.split('/')[0].trim().padEnd(27)} | ${shortEvidence} |`;
  updated++;
  synced.push(feature);
}

writeFileSync(featurePath, lines.join('\n'));
console.log(JSON.stringify({ updated, synced }, null, 2));
