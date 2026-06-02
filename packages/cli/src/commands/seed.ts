/**
 * manifest seed command
 *
 * Generates realistic seed data files from IR entity definitions.
 * Supports JSON, SQL, and Supabase output formats and dev/staging/demo profiles.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';
import type { IR, IREntity, IRProperty, IRType, IRValue } from '@angriff36/manifest/ir';

// ---------- Public types ----------

export type SeedProfile = 'dev' | 'staging' | 'demo';
export type SeedFormat = 'json' | 'sql' | 'supabase';

export interface SeedOptions {
  /** Source file (.manifest or .ir.json) or directory */
  source?: string;
  /** Output file or directory path */
  output?: string;
  /** Profile controls default record counts per entity */
  profile?: SeedProfile;
  /** Output format */
  format?: SeedFormat;
  /** Override record count for every entity */
  count?: number;
  /** Only seed the named entity (repeatable) */
  entity?: string[];
  /** Deterministic seed for reproducible output */
  seed?: number;
  /** Emit structured JSON to stdout instead of writing files */
  json?: boolean;
}

export interface SeedResult {
  profile: SeedProfile;
  format: SeedFormat;
  seed: number;
  entities: Record<string, number>;
  total: number;
}

// ---------- Profile defaults ----------

const PROFILE_COUNTS: Record<SeedProfile, number> = {
  dev: 5,
  staging: 20,
  demo: 50,
};

// ---------- Loader ----------

async function loadIR(source: string | undefined): Promise<IR> {
  if (!source) {
    throw new Error('No source specified. Provide a .manifest or .ir.json file.');
  }

  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    if (resolved.endsWith('.ir.json')) {
      const content = await fs.readFile(resolved, 'utf-8');
      return JSON.parse(content) as IR;
    }
    // Treat as .manifest source — compile to IR.
    const { compileToIR } = await import('@angriff36/manifest/ir-compiler');
    const fileContent = await fs.readFile(resolved, 'utf-8');
    const result = await compileToIR(fileContent, { sourcePath: resolved });
    if (!result.ir) {
      const errors = (result.diagnostics || [])
        .filter((d) => d.severity === 'error')
        .map((d) => d.message)
        .join('; ');
      throw new Error(`Compilation failed: ${errors || 'unknown error'}`);
    }
    return result.ir;
  }

  // Directory: find an .ir.json inside
  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  if (irFiles.length === 0) {
    throw new Error(`No .ir.json files found in directory: ${source}`);
  }
  const first = path.join(resolved, irFiles[0]);
  const content = await fs.readFile(first, 'utf-8');
  return JSON.parse(content) as IR;
}

// ---------- Seedable PRNG (mulberry32) ----------

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ---------- Realistic string templates ----------

const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Hank',
  'Ivy', 'Jack', 'Kate', 'Leo', 'Maya', 'Nick', 'Olive', 'Paul',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez',
];
const DOMAINS = ['example.com', 'test.org', 'demo.io', 'mail.net'];
const STATUS_WORDS = ['active', 'pending', 'archived', 'draft', 'published'];
const TITLE_WORDS = [
  'Introduction to', 'Advanced', 'Practical', 'Modern', 'Essential',
  'Building', 'Designing', 'Understanding', 'Mastering', 'Exploring',
];
const NOUN_WORDS = [
  'Systems', 'Patterns', 'Architecture', 'Workflows', 'Practices',
  'Foundations', 'Principles', 'Techniques', 'Strategies', 'Concepts',
];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function generateString(rng: () => number, propertyName: string): string {
  const name = propertyName.toLowerCase();

  if (name === 'email') {
    const first = pick(rng, FIRST_NAMES).toLowerCase();
    const last = pick(rng, LAST_NAMES).toLowerCase();
    return `${first}.${last}@${pick(rng, DOMAINS)}`;
  }
  if (name === 'firstname' || name === 'first_name') {
    return pick(rng, FIRST_NAMES);
  }
  if (name === 'lastname' || name === 'last_name') {
    return pick(rng, LAST_NAMES);
  }
  if (name === 'name' || name === 'fullname' || name === 'full_name') {
    return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
  }
  if (name === 'username') {
    return `${pick(rng, FIRST_NAMES).toLowerCase()}${randInt(rng, 1, 99)}`;
  }
  if (name === 'title') {
    return `${pick(rng, TITLE_WORDS)} ${pick(rng, NOUN_WORDS)}`;
  }
  if (name === 'status' || name === 'state') {
    return pick(rng, STATUS_WORDS);
  }
  if (name === 'description' || name === 'bio' || name === 'notes') {
    return `${titleCase(propertyName)} for ${pick(rng, FIRST_NAMES)} #${randInt(rng, 1, 999)}`;
  }
  if (name === 'phone' || name === 'phonenumber') {
    return `+1-555-${String(randInt(rng, 100, 999))}-${String(randInt(rng, 1000, 9999))}`;
  }
  if (name === 'url' || name === 'website') {
    return `https://${pick(rng, DOMAINS)}/${pick(rng, NOUN_WORDS).toLowerCase()}`;
  }
  if (name === 'slug') {
    return `${pick(rng, NOUN_WORDS).toLowerCase()}-${randInt(rng, 1, 999)}`;
  }

  // Default: combine property name with index for determinism hint
  return `${titleCase(propertyName)} ${randInt(rng, 1, 9999)}`;
}

function generateNumber(rng: () => number, propertyName: string, isInt: boolean): number {
  const name = propertyName.toLowerCase();
  if (name === 'age') return randInt(rng, 18, 90);
  if (name === 'price' || name === 'amount' || name === 'total') {
    return Math.round((rng() * 990 + 10) * 100) / 100;
  }
  if (name === 'quantity' || name === 'count' || name === 'stock') {
    return randInt(rng, 0, 500);
  }
  if (name === 'year') return randInt(rng, 2020, 2025);
  if (name === 'rating' || name === 'score') {
    return Math.round((rng() * 5) * 10) / 10;
  }
  if (isInt) return randInt(rng, 1, 1000);
  return Math.round(rng() * 10000 * 100) / 100;
}

function generateTimestamp(rng: () => number): string {
  const now = Date.now();
  const offset = randInt(rng, 0, 90) * 24 * 60 * 60 * 1000; // within last 90 days
  return new Date(now - offset).toISOString();
}

// ---------- IR value resolution ----------

function resolveIRValue(v: IRValue): unknown {
  switch (v.kind) {
    case 'string': return v.value;
    case 'number': return v.value;
    case 'boolean': return v.value;
    case 'null': return null;
    case 'array': return v.elements.map(resolveIRValue);
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v.properties)) {
        out[k] = resolveIRValue(val);
      }
      return out;
    }
    default: return null;
  }
}

function baseTypeName(t: IRType): string {
  return (t.name || '').toLowerCase();
}

function isIntType(t: IRType): boolean {
  const n = baseTypeName(t);
  return n === 'int' || n === 'integer';
}

function isTimestampType(t: IRType): boolean {
  const n = baseTypeName(t);
  return n === 'timestamp' || n === 'datetime' || n === 'date';
}

// ---------- Topological sort ----------

function topologicalSort(entities: IREntity[]): IREntity[] {
  // An entity depends on the targets it references via FK (belongsTo/ref).
  // hasMany/hasOne on the parent side are *not* real dependencies — the FK
  // lives on the child entity, so the parent must be generated first, but
  // the parent itself does not need any data from the child to exist.
  const byName = new Map(entities.map((e) => [e.name, e]));
  const deps = new Map<string, Set<string>>();

  for (const entity of entities) {
    const set = new Set<string>();
    for (const rel of entity.relationships) {
      if (rel.kind === 'belongsTo' || rel.kind === 'ref') {
        if (byName.has(rel.target) && rel.target !== entity.name) {
          set.add(rel.target);
        }
      }
    }
    deps.set(entity.name, set);
  }

  const sorted: IREntity[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (entity: IREntity): void => {
    if (visited.has(entity.name)) return;
    if (visiting.has(entity.name)) {
      // Cycle — break it by skipping (we'll just generate with empty FK list)
      return;
    }
    visiting.add(entity.name);
    for (const dep of deps.get(entity.name) || []) {
      const depEntity = byName.get(dep);
      if (depEntity) visit(depEntity);
    }
    visiting.delete(entity.name);
    visited.add(entity.name);
    sorted.push(entity);
  };

  for (const entity of entities) visit(entity);
  return sorted;
}

// ---------- Property generation ----------

interface GeneratorContext {
  rng: () => number;
  /** Map of entity name -> generated id list (for FK references) */
  generatedIds: Map<string, string[]>;
}

function generateId(rng: () => number, entityName: string): string {
  // Fully deterministic — must not read wall-clock time, otherwise FK
  // references generated in a later entity call can't match ids minted
  // earlier in the same run.
  return `${entityName.toLowerCase()}_${Math.floor(rng() * 0xffffffff).toString(36).padStart(7, '0')}`;
}

function generatePropertyValue(
  prop: IRProperty,
  ctx: GeneratorContext,
  seenValues: Set<string>
): unknown {
  const typeName = baseTypeName(prop.type);

  // Use default value when present
  if (prop.defaultValue) {
    return resolveIRValue(prop.defaultValue);
  }

  const isUnique = prop.modifiers.includes('unique');
  const isRequired = prop.modifiers.includes('required') || !prop.modifiers.includes('optional');
  const nullable = prop.type.nullable;

  const tryGenerate = (): unknown => {
    if (typeName === 'string' || typeName === 'text') {
      return generateString(ctx.rng, prop.name);
    }
    if (isIntType(prop.type)) {
      return generateNumber(ctx.rng, prop.name, true);
    }
    if (typeName === 'number' || typeName === 'float' || typeName === 'decimal') {
      return generateNumber(ctx.rng, prop.name, false);
    }
    if (typeName === 'boolean') {
      return ctx.rng() < 0.5;
    }
    if (isTimestampType(prop.type)) {
      return generateTimestamp(ctx.rng);
    }
    if (typeName === 'uuid') {
      // RFC4122 v4-ish — deterministic enough for our purposes
      const hex = (_n: number) => Math.floor(ctx.rng() * 0x100000000).toString(16).padStart(8, '0');
      return `${hex(0)}-${hex(0).slice(0, 4)}-4${hex(0).slice(0, 3)}-${hex(0).slice(0, 4)}-${hex(0)}${hex(0).slice(0, 4)}`;
    }
    if (typeName === 'array') {
      return [];
    }
    if (typeName === 'object' || typeName === 'map' || typeName.startsWith('map<')) {
      return {};
    }
    // Fallback: treat as string
    return generateString(ctx.rng, prop.name);
  };

  // Handle uniqueness with bounded retries
  if (isUnique) {
    for (let i = 0; i < 50; i++) {
      const v = tryGenerate();
      const key = `${typeof v}:${String(v)}`;
      if (!seenValues.has(key)) {
        seenValues.add(key);
        return v;
      }
    }
    // If we exhaust retries, append a counter to break the tie
    const v = tryGenerate();
    seenValues.add(`${typeof v}:${String(v)}_${seenValues.size}`);
    return `${String(v)}_${seenValues.size}`;
  }

  // Nullable + not required: 20% chance of null
  if (nullable && !isRequired && ctx.rng() < 0.2) {
    return null;
  }

  return tryGenerate();
}

// ---------- Entity record generation ----------

function generateEntityRecords(
  entity: IREntity,
  count: number,
  ctx: GeneratorContext
): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seenValuesPerProp = new Map<string, Set<string>>();

  for (let i = 0; i < count; i++) {
    const record: Record<string, unknown> = {};

    // Always assign an id
    record['id'] = generateId(ctx.rng, entity.name);

    for (const prop of entity.properties) {
      if (prop.name === 'id') {
        // Skip — we set it above
        continue;
      }
      const seen = seenValuesPerProp.get(prop.name) ?? new Set<string>();
      seenValuesPerProp.set(prop.name, seen);
      record[prop.name] = generatePropertyValue(prop, ctx, seen);
    }

    // Inject FK values for belongsTo / ref / hasOne
    for (const rel of entity.relationships) {
      if (rel.kind === 'belongsTo' || rel.kind === 'ref' || rel.kind === 'hasOne') {
        const targetIds = ctx.generatedIds.get(rel.target) || [];
        if (targetIds.length > 0) {
          record[rel.name] = pick(ctx.rng, targetIds);
        } else if (rel.kind !== 'ref') {
          // belongsTo/hasOne without a generated target: leave null
          record[rel.name] = null;
        }
      }
      // hasMany is owned by the child entity, so it doesn't get a column here
    }

    // Auto-inject createdAt/updatedAt when timestamps: true
    if (entity.timestamps) {
      const ts = generateTimestamp(ctx.rng);
      if (!('createdAt' in record)) record['createdAt'] = ts;
      if (!('updatedAt' in record)) record['updatedAt'] = ts;
    }

    records.push(record);
  }

  return records;
}

// ---------- Output formatters ----------

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

function toJsonbObject(record: Record<string, unknown>): string {
  return `'${sqlEscape(JSON.stringify(record))}'::jsonb`;
}

function formatSql(ir: IR, data: Record<string, Record<string, unknown>[]>): string {
  const lines: string[] = [];
  lines.push('-- Seed data generated by manifest seed');
  lines.push(`-- Profile: ${data['_meta'] ? '' : ''}`);
  lines.push('');

  for (const entity of ir.entities) {
    const records = data[entity.name] || [];
    if (records.length === 0) continue;

    const tableName = entity.name.toLowerCase();
    lines.push(`-- ${entity.name} (${records.length} rows)`);

    // Postgres seed format wraps each record in a jsonb `data` column to match
    // the store adapter contract (id, data, created_at, updated_at).
    lines.push(`INSERT INTO ${tableName} (id, data, created_at, updated_at) VALUES`);

    const values = records.map((r) => {
      const id = String(r['id'] ?? '');
      const jsonb = toJsonbObject(r);
      const ts = new Date().toISOString();
      return `  ('${sqlEscape(id)}', ${jsonb}, '${ts}', '${ts}')`;
    });

    lines.push(values.join(',\n') + ';');
    lines.push('');
  }

  return lines.join('\n');
}

function formatJson(ir: IR, data: Record<string, Record<string, unknown>[]>): string {
  // Object keyed by entity name. Stable key order = IR entity order.
  const out: Record<string, unknown> = {};
  for (const entity of ir.entities) {
    out[entity.name] = data[entity.name] || [];
  }
  return JSON.stringify(out, null, 2);
}

function formatSupabase(ir: IR, data: Record<string, Record<string, unknown>[]>): string {
  // Supabase seed format: a JS module exporting the records per table.
  // Consumers can `import seed from './seed.supabase.json'` and call
  // supabase.from(table).insert(seed[entity]).
  const out: Record<string, unknown> = {};
  for (const entity of ir.entities) {
    out[entity.name] = data[entity.name] || [];
  }
  return JSON.stringify({ tables: out }, null, 2);
}

// ---------- Main command ----------

function resolveCount(
  profile: SeedProfile,
  override: number | undefined
): number {
  if (override !== undefined && override >= 0) return override;
  return PROFILE_COUNTS[profile];
}

function pickEntities(ir: IR, entityFilter: string[] | undefined): IREntity[] {
  if (!entityFilter || entityFilter.length === 0) return ir.entities;
  const set = new Set(entityFilter);
  const filtered = ir.entities.filter((e) => set.has(e.name));
  if (filtered.length === 0) {
    throw new Error(
      `No matching entities for --entity ${entityFilter.join(', ')}. ` +
        `Available: ${ir.entities.map((e) => e.name).join(', ')}`
    );
  }
  return filtered;
}

function outputFileName(format: SeedFormat, entityFilter?: string[]): string {
  const suffix = entityFilter && entityFilter.length === 1 ? entityFilter[0] : 'all';
  if (format === 'sql') return `seed.${suffix}.sql`;
  if (format === 'supabase') return `seed.${suffix}.supabase.json`;
  return `seed.${suffix}.json`;
}

export async function seedCommand(options: SeedOptions = {}): Promise<void> {
  const spinner = ora('Preparing to generate seed data').start();
  const profile: SeedProfile = options.profile || 'dev';
  const format: SeedFormat = options.format || 'json';
  const seed = options.seed ?? Date.now();

  try {
    if (!['dev', 'staging', 'demo'].includes(profile)) {
      throw new Error(`Invalid profile: ${profile}. Use dev, staging, or demo.`);
    }
    if (!['json', 'sql', 'supabase'].includes(format)) {
      throw new Error(`Invalid format: ${format}. Use json, sql, or supabase.`);
    }

    spinner.text = 'Loading IR';
    const ir = await loadIR(options.source);

    if (!ir.entities || ir.entities.length === 0) {
      spinner.warn('No entities found in IR');
      return;
    }

    const entities = pickEntities(ir, options.entity);
    const count = resolveCount(profile, options.count);
    const rng = createRng(seed);

    spinner.text = `Sorting ${entities.length} entities by dependency order`;
    const sorted = topologicalSort(entities);

    // Multi-pass: if the entity list is filtered, we may need generated IDs
    // from entities that weren't requested. Generate a minimal id list for
    // any missing dependency so FK references resolve.
    const generatedIds = new Map<string, string[]>();
    for (const entity of ir.entities) {
      if (!entities.some((e) => e.name === entity.name)) {
        // Pre-seed id pool for FK targets that aren't in the output set
        const ids: string[] = [];
        for (let i = 0; i < Math.max(count, 3); i++) {
          ids.push(generateId(rng, entity.name));
        }
        generatedIds.set(entity.name, ids);
      }
    }

    const data: Record<string, Record<string, unknown>[]> = {};
    const counts: Record<string, number> = {};

    for (const entity of sorted) {
      spinner.text = `Seeding ${entity.name} (${count} records)`;
      const ctx: GeneratorContext = { rng, generatedIds };
      const records = generateEntityRecords(entity, count, ctx);
      data[entity.name] = records;
      generatedIds.set(entity.name, records.map((r) => String(r['id'])));
      counts[entity.name] = records.length;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    // Format output
    let body: string;
    if (format === 'sql') {
      body = formatSql(ir, data);
    } else if (format === 'supabase') {
      body = formatSupabase(ir, data);
    } else {
      body = formatJson(ir, data);
    }

    const result: SeedResult = { profile, format, seed, entities: counts, total };

    if (options.json) {
      // Structured output to stdout: include the formatted body as a string field
      console.log(JSON.stringify({ ...result, body }, null, 2));
      spinner.succeed(`Generated ${total} record(s) across ${entities.length} entity/entities`);
      return;
    }

    // Write to file
    const defaultName = outputFileName(format, options.entity);
    const outputPath = options.output
      ? path.resolve(process.cwd(), options.output)
      : path.resolve(process.cwd(), defaultName);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, body, 'utf-8');

    spinner.succeed(
      `Seeded ${total} record(s) across ${entities.length} entity/entities → ${path.relative(process.cwd(), outputPath)}`
    );

    // Brief human summary
    console.log('');
    console.log(chalk.bold('Seed summary:'));
    console.log(`  ${chalk.gray('Profile:')}    ${profile}`);
    console.log(`  ${chalk.gray('Format:')}     ${format}`);
    console.log(`  ${chalk.gray('Seed:')}       ${seed}`);
    console.log(`  ${chalk.gray('Per-entity:')} ${count}`);
    console.log(`  ${chalk.gray('Total:')}      ${total}`);
    console.log(`  ${chalk.gray('Output:')}     ${path.relative(process.cwd(), outputPath)}`);
  } catch (error: unknown) {
    spinner.fail(
      `Seed generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
