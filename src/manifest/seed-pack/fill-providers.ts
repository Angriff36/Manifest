/**
 * Fill providers for seed packs.
 */

import {
  isBlankCell,
  FILL_PLACEHOLDER,
  type SeedFillProvider,
  type SeedFillEntityInput,
} from './types.js';

/** Deterministic offline filler — no network. Used in tests and as fallback. */
export function createHeuristicFillProvider(seed = 1): SeedFillProvider {
  let state = seed >>> 0;
  const rng = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    async fillEntity(input: SeedFillEntityInput) {
      return input.rows.map((row, rowIndex) => {
        const out: Record<string, string> = { ...row };
        for (const col of input.columns) {
          if (col === 'seedKey') continue;
          if (!isBlankCell(out[col]) && !input.overwrite) continue;

          const allowed = input.allowedSeedKeys[col];
          if (allowed && allowed.length > 0) {
            out[col] = allowed[Math.floor(rng() * allowed.length)]!;
            continue;
          }

          const lower = col.toLowerCase();
          if (lower.includes('email')) {
            out[col] = `user${rowIndex + 1}@example.com`;
          } else if (lower.includes('name') || lower === 'title') {
            out[col] = `${input.entityName} ${rowIndex + 1}`;
          } else if (lower.includes('status')) {
            out[col] = 'active';
          } else if (lower.includes('phone')) {
            out[col] = `+1-555-010${rowIndex}`;
          } else {
            out[col] = `${col}-${rowIndex + 1}`;
          }
        }
        return out;
      });
    },
  };
}

export interface OllamaFillOptions {
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/** Cheap local model via Ollama HTTP API. */
export function createOllamaFillProvider(options: OllamaFillOptions = {}): SeedFillProvider {
  const baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
  const model = options.model ?? 'llama3.2';
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async fillEntity(input: SeedFillEntityInput) {
      const prompt = [
        'Fill blank CSV cells for demo seed data. Return ONLY a JSON array of objects.',
        `Entity: ${input.entityName}`,
        `Columns: ${input.columns.join(', ')}`,
        `Allowed FK seedKeys by column: ${JSON.stringify(input.allowedSeedKeys)}`,
        'Rules: keep seedKey unchanged; only fill empty or {{fill}} cells unless overwrite is true;',
        'use allowed FK seedKeys when provided; realistic short demo values.',
        `overwrite=${input.overwrite}`,
        `Rows: ${JSON.stringify(input.rows)}`,
      ].join('\n');

      const res = await fetchImpl(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, format: 'json' }),
      });
      if (!res.ok) {
        throw new Error(`Ollama fill failed: HTTP ${res.status}`);
      }
      const body = (await res.json()) as { response?: string };
      const parsed = JSON.parse(body.response ?? '[]') as Record<string, string>[];
      if (!Array.isArray(parsed) || parsed.length !== input.rows.length) {
        throw new Error('Ollama fill returned unexpected row count');
      }
      return parsed.map((row, i) => {
        const merged: Record<string, string> = { ...input.rows[i] };
        for (const col of input.columns) {
          if (col === 'seedKey') {
            merged.seedKey = input.rows[i]!.seedKey!;
            continue;
          }
          const next = row[col];
          if (next == null) continue;
          if (!input.overwrite && !isBlankCell(merged[col])) continue;
          if (input.overwrite || isBlankCell(merged[col])) {
            merged[col] = String(next);
          }
        }
        // Never leave literal placeholder if model echoed it
        for (const col of input.columns) {
          if (merged[col] === FILL_PLACEHOLDER) merged[col] = '';
        }
        return merged;
      });
    },
  };
}
