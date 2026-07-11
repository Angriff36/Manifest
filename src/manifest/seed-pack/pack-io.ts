/**
 * Read/write seed packs (manifest.seed.json + entities/*.csv).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SeedEntityTable, SeedPack, SeedPackMeta, SeedRow } from './types.js';

const META_FILE = 'manifest.seed.json';
const ENTITIES_DIR = 'entities';

export function serializeCsv(columns: string[], rows: SeedRow[]): string {
  const escape = (v: string): string => {
    if (/[",\n\r]/.test(v)) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [columns.map(escape).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

export function parseCsv(text: string): { columns: string[]; rows: SeedRow[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }
  const columns = splitCsvLine(lines[0]!);
  const rows: SeedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const row: SeedRow = {};
    for (let c = 0; c < columns.length; c++) {
      row[columns[c]!] = cells[c] ?? '';
    }
    rows.push(row);
  }
  return { columns, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function writeSeedPack(dir: string, pack: SeedPack): Promise<void> {
  await fs.mkdir(path.join(dir, ENTITIES_DIR), { recursive: true });
  const meta: SeedPackMeta = {
    ...pack.meta,
    entities: pack.tables.map((t) => t.entity),
  };
  await fs.writeFile(path.join(dir, META_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');
  for (const table of pack.tables) {
    const file = path.join(dir, ENTITIES_DIR, `${table.entity}.csv`);
    await fs.writeFile(file, serializeCsv(table.columns, table.rows), 'utf8');
  }
}

export async function readSeedPack(dir: string): Promise<SeedPack> {
  const metaRaw = await fs.readFile(path.join(dir, META_FILE), 'utf8');
  const meta = JSON.parse(metaRaw) as SeedPackMeta;
  if (!meta.packId || !meta.version || !Array.isArray(meta.entities)) {
    throw new Error('Invalid manifest.seed.json: need packId, version, entities[]');
  }
  const tables: SeedEntityTable[] = [];
  for (const entity of meta.entities) {
    const file = path.join(dir, ENTITIES_DIR, `${entity}.csv`);
    const text = await fs.readFile(file, 'utf8');
    const { columns, rows } = parseCsv(text);
    if (columns[0] !== 'seedKey') {
      throw new Error(`${entity}.csv must start with seedKey column`);
    }
    tables.push({ entity, columns, rows });
  }
  return { meta, tables };
}
