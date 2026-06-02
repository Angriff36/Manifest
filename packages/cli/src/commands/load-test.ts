/**
 * manifest load-test command
 *
 * Generates k6 or Artillery load test scripts from IR entities and commands.
 * Produces self-contained scripts with realistic data generation (faker.js
 * patterns), configurable ramp-up profiles, SLO thresholds, and optional
 * integration with the Manifest performance profiler.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import type { IR, IREntity, IRCommand, IRProperty, IRType } from '@angriff36/manifest/ir';

// ---------- Public types ----------

export type LoadTestFormat = 'k6' | 'artillery';

export interface RampStage {
  /** Duration string like "30s", "1m", "5m" */
  duration: string;
  /** Target number of virtual users */
  target: number;
}

export interface SloThreshold {
  /** Metric name (e.g. "p95", "p99", "error_rate", "http_req_duration") */
  metric: string;
  /** Comparison operator */
  op: '<' | '<=' | '>' | '>=';
  /** Threshold value (in ms for duration, fraction for error_rate) */
  value: number;
  /** Abort the test when this threshold is crossed */
  abortOnFail?: boolean;
}

export interface LoadTestOptions {
  /** Source .manifest or .ir.json file */
  source?: string;
  /** Output directory for generated scripts */
  output?: string;
  /** Script format */
  format?: LoadTestFormat;
  /** Base URL for the API under test */
  baseUrl?: string;
  /** Ramp-up profile string like "10s:5,30s:20,1m:50" */
  rampUp?: string;
  /** SLO threshold string like "p95:500ms,p99:1s,error_rate:0.01" */
  slo?: string;
  /** Only generate scripts for the named command(s) (repeatable) */
  command?: string[];
  /** Only generate scripts for the named entity (repeatable) */
  entity?: string[];
  /** Generate a profiler integration header comment */
  profile?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Emit structured JSON to stdout instead of writing files */
  json?: boolean;
}

export interface LoadTestResult {
  format: LoadTestFormat;
  baseUrl: string;
  rampUp: RampStage[];
  slo: SloThreshold[];
  commands: string[];
  entities: string[];
  files: Record<string, string>;
  profilerIntegration: boolean;
}

// ---------- Defaults ----------

const DEFAULT_RAMP_UP = '10s:5,30s:20,1m:50';
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_FORMAT: LoadTestFormat = 'k6';

// ---------- Parsers ----------

function parseRampUp(input: string | undefined): RampStage[] {
  const raw = input || DEFAULT_RAMP_UP;
  const stages: RampStage[] = [];

  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [duration, targetRaw] = trimmed.split(':');
    if (!duration || !targetRaw) {
      throw new Error(
        `Invalid ramp-up stage: "${trimmed}". Expected format: "duration:target" (e.g. "30s:20")`
      );
    }
    const target = parseInt(targetRaw.trim(), 10);
    if (isNaN(target) || target < 0) {
      throw new Error(`Invalid ramp-up target: "${targetRaw}". Must be a non-negative integer.`);
    }
    if (!/^\d+[smh]$/.test(duration.trim())) {
      throw new Error(
        `Invalid ramp-up duration: "${duration}". Must end with s, m, or h (e.g. "30s", "5m").`
      );
    }
    stages.push({ duration: duration.trim(), target });
  }

  if (stages.length === 0) {
    throw new Error('Ramp-up profile must have at least one stage.');
  }
  return stages;
}

function parseSlo(input: string | undefined): SloThreshold[] {
  if (!input) return [];
  const thresholds: SloThreshold[] = [];

  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Syntax: metric:op:value[:abort]
    // Examples: p95:<:500ms  |  error_rate:<=:0.01  |  p99:<:1s:abort
    const segments = trimmed.split(':');
    if (segments.length < 3) {
      throw new Error(
        `Invalid SLO threshold: "${trimmed}". Expected format: "metric:op:value" (e.g. "p95:<:500ms")`
      );
    }

    const [metric, op, valueRaw, ...flags] = segments;
    const opTrimmed = op as SloThreshold['op'];
    if (!['<', '<=', '>', '>='].includes(opTrimmed)) {
      throw new Error(
        `Invalid SLO operator: "${op}". Must be one of: <, <=, >, >=.`
      );
    }

    const value = parseDurationOrNumber(valueRaw.trim());
    const abortOnFail = flags.includes('abort');

    thresholds.push({ metric: metric.trim(), op: opTrimmed, value, abortOnFail });
  }

  return thresholds;
}

/** Parse a value like "500ms", "1s", "0.01", or "42" into a number (ms or fraction). */
function parseDurationOrNumber(raw: string): number {
  if (raw.endsWith('ms')) {
    return parseFloat(raw.slice(0, -2));
  }
  if (raw.endsWith('s')) {
    return parseFloat(raw.slice(0, -1)) * 1000;
  }
  if (raw.endsWith('m')) {
    return parseFloat(raw.slice(0, -1)) * 60 * 1000;
  }
  return parseFloat(raw);
}

function durationToMs(raw: string): number {
  if (raw.endsWith('ms')) return parseInt(raw.slice(0, -2), 10);
  if (raw.endsWith('s')) return parseInt(raw.slice(0, -1), 10) * 1000;
  if (raw.endsWith('m')) return parseInt(raw.slice(0, -1), 10) * 60 * 1000;
  if (raw.endsWith('h')) return parseInt(raw.slice(0, -1), 10) * 60 * 60 * 1000;
  return parseInt(raw, 10);
}

// ---------- IR loading (mirrors seed.ts) ----------

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

  const { glob } = await import('glob');
  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  if (irFiles.length === 0) {
    throw new Error(`No .ir.json files found in directory: ${source}`);
  }
  const first = path.join(resolved, irFiles[0]);
  const content = await fs.readFile(first, 'utf-8');
  return JSON.parse(content) as IR;
}

// ---------- IR inspection ----------

function pickCommands(ir: IR, filter: string[] | undefined): IRCommand[] {
  const allCommands: IRCommand[] = [];

  // Build a map of command name -> full command object (from top-level ir.commands)
  const cmdByName = new Map<string, IRCommand>();
  for (const cmd of ir.commands) {
    cmdByName.set(cmd.name, cmd);
  }

  // Collect commands referenced by entities
  const seen = new Set<string>();
  for (const entity of ir.entities) {
    for (const ref of entity.commands) {
      // entity.commands may be string[] (name references) or IRCommand[] (embedded)
      const cmdName = typeof ref === 'string' ? ref : (ref as IRCommand).name;
      if (!cmdName || seen.has(cmdName)) continue;
      const full = cmdByName.get(cmdName);
      if (full) {
        allCommands.push({ ...full, entityName: entity.name });
        seen.add(cmdName);
      } else if (typeof ref !== 'string') {
        // Embedded command object
        allCommands.push({ ...(ref as IRCommand), entityName: entity.name });
        seen.add(cmdName);
      }
    }
  }

  // Also include any top-level commands not already seen
  for (const cmd of ir.commands) {
    if (!seen.has(cmd.name)) {
      allCommands.push(cmd);
    }
  }

  if (!filter || filter.length === 0) return allCommands;
  const set = new Set(filter);
  const matched = allCommands.filter((c) => set.has(c.name));
  if (matched.length === 0) {
    throw new Error(
      `No matching commands for --command ${filter.join(', ')}. ` +
        `Available: ${allCommands.map((c) => c.name).join(', ')}`
    );
  }
  return matched;
}

function pickEntities(ir: IR, filter: string[] | undefined): IREntity[] {
  if (!filter || filter.length === 0) return ir.entities;
  const set = new Set(filter);
  const matched = ir.entities.filter((e) => set.has(e.name));
  if (matched.length === 0) {
    throw new Error(
      `No matching entities for --entity ${filter.join(', ')}. ` +
        `Available: ${ir.entities.map((e) => e.name).join(', ')}`
    );
  }
  return matched;
}

// ---------- faker.js code generation ----------

/**
 * Generate a JavaScript expression that returns a realistic value for the
 * given IR property. Uses inline faker-style helpers (no external deps).
 */
function generateFakerExpr(prop: IRProperty, entityName: string): string {
  const name = prop.name.toLowerCase();
  const typeName = (prop.type.name || '').toLowerCase();

  // Name-based faker patterns
  if (name === 'email' || name.endsWith('email')) return 'faker.email()';
  if (name === 'firstname' || name === 'first_name') return 'faker.firstName()';
  if (name === 'lastname' || name === 'last_name') return 'faker.lastName()';
  if (name === 'name' || name === 'fullname' || name === 'full_name') return 'faker.fullName()';
  if (name === 'username') return 'faker.userName()';
  if (name === 'phone' || name === 'phonenumber') return 'faker.phoneNumber()';
  if (name === 'url' || name === 'website') return 'faker.url()';
  if (name === 'title') return 'faker.title()';
  if (name === 'description' || name === 'bio' || name === 'notes') return 'faker.sentence()';
  if (name === 'slug') return 'faker.slug()';
  if (name === 'uuid' || name === 'id') return 'faker.uuid()';
  if (name === 'status' || name === 'state') return 'faker.status()';
  if (name === 'city') return 'faker.city()';
  if (name === 'country') return 'faker.country()';
  if (name === 'zipcode' || name === 'zip' || name === 'postalcode') return 'faker.zipCode()';
  if (name === 'address') return 'faker.address()';
  if (name === 'company' || name === 'companyname') return 'faker.companyName()';
  if (name === 'avatar' || name.endsWith('avatar')) return 'faker.avatarUrl()';
  if (name === 'age') return `Math.floor(Math.random() * 72) + 18`;
  if (name === 'price' || name === 'amount' || name === 'total') {
    return `Math.round((Math.random() * 990 + 10) * 100) / 100`;
  }
  if (name === 'quantity' || name === 'count' || name === 'stock') {
    return `Math.floor(Math.random() * 500)`;
  }
  if (name === 'year') return `${new Date().getFullYear() - Math.floor(Math.random() * 5)}`;
  if (name === 'rating' || name === 'score') {
    return `Math.round((Math.random() * 5) * 10) / 10`;
  }

  // Type-based fallback
  if (typeName === 'string' || typeName === 'text') {
    if (name.includes('name')) return 'faker.word()';
    return 'faker.word()';
  }
  if (typeName === 'int' || typeName === 'integer') {
    return `Math.floor(Math.random() * 1000) + 1`;
  }
  if (typeName === 'number' || typeName === 'float' || typeName === 'decimal') {
    return `Math.round(Math.random() * 10000) / 100`;
  }
  if (typeName === 'boolean') return `Math.random() < 0.5`;
  if (typeName === 'uuid') return 'faker.uuid()';
  if (typeName === 'timestamp' || typeName === 'datetime' || typeName === 'date') {
    return 'new Date(Date.now() - Math.random() * 90 * 86400000).toISOString()';
  }
  if (typeName === 'array') return '[]';
  if (typeName === 'object' || typeName.startsWith('map')) return '{}';

  // Ultimate fallback: FK-style id
  return `'${entityName.toLowerCase()}_' + faker.uuid().slice(0, 8)`;
}

// ---------- Self-contained faker helpers ----------
// These are inlined into every generated script so the output is portable.

const FAKER_HELPERS_JS = `
// ---- faker.js-compatible helpers (self-contained, no deps) ----
const FIRST_NAMES = ['Alice','Bob','Carol','David','Eve','Frank','Grace','Hank','Ivy','Jack','Kate','Leo','Maya','Nick','Olive','Paul','Quinn','Rita','Sam','Tara','Uma','Victor','Wendy','Xavier','Yara','Zane'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee'];
const DOMAINS = ['example.com','test.org','demo.io','mail.net','sample.co','placeholder.dev'];
const WORDS = ['systems','patterns','architecture','workflows','practices','foundations','principles','techniques','strategies','concepts','modules','components','services','layers','domains'];
const STATUSES = ['active','pending','archived','draft','published','review','approved','rejected'];
const COMPANIES = ['Acme','Globex','Initech','Umbrella','Cyberdyne','Hooli','Pied Piper','Massive Dynamic','Stark','Wayne','Wonka','Soylent'];
const CITIES = ['Springfield','Portland','Salem','Boulder','Austin','Reno','Boise','Fresno','Tacoma','Lansing','Albany','Macon'];
const COUNTRIES = ['United States','Canada','United Kingdom','Germany','France','Japan','Australia','Brazil','India','Mexico'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const faker = {
  uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }),
  email: () => pick(FIRST_NAMES).toLowerCase() + '.' + pick(LAST_NAMES).toLowerCase() + '@' + pick(DOMAINS),
  firstName: () => pick(FIRST_NAMES),
  lastName: () => pick(LAST_NAMES),
  fullName: () => pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES),
  userName: () => pick(FIRST_NAMES).toLowerCase() + randInt(1, 99),
  phoneNumber: () => '+1-555-' + String(randInt(100, 999)) + '-' + String(randInt(1000, 9999)),
  url: () => 'https://' + pick(DOMAINS) + '/' + pick(WORDS),
  title: () => pick(['Introduction to','Advanced','Practical','Modern','Essential','Building']) + ' ' + pick(WORDS),
  sentence: () => pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES) + ' #' + randInt(1, 999),
  slug: () => pick(WORDS) + '-' + randInt(1, 999),
  status: () => pick(STATUSES),
  city: () => pick(CITIES),
  country: () => pick(COUNTRIES),
  zipCode: () => String(randInt(10000, 99999)),
  address: () => randInt(100, 9999) + ' ' + pick(WORDS) + ' St, ' + pick(CITIES),
  companyName: () => pick(COMPANIES) + ' ' + pick(['Inc','LLC','Corp','Ltd','Group']),
  avatarUrl: () => 'https://i.pravatar.cc/150?u=' + randInt(1, 9999),
  word: () => pick(WORDS),
  boolean: () => Math.random() < 0.5,
  integer: (min, max) => randInt(min || 1, max || 1000),
  float: (min, max) => Math.round((Math.random() * ((max || 100) - (min || 0)) + (min || 0)) * 100) / 100,
};
// ---- end faker helpers ----
`;

// ---------- k6 generator ----------

function generateK6Script(
  entityName: string,
  command: IRCommand,
  properties: IRProperty[],
  opts: {
    baseUrl: string;
    rampUp: RampStage[];
    slo: SloThreshold[];
    timeout: number;
    profilerIntegration: boolean;
  }
): string {
  const pathSuffix = commandNameToPath(command.name);
  const bodyProps: string[] = [];

  for (const prop of properties) {
    if (prop.name === 'id') continue;
    bodyProps.push(`    ${prop.name}: ${generateFakerExpr(prop, entityName)}`);
  }

  const bodyObj = bodyProps.length > 0 ? `{\n${bodyProps.join(',\n')}\n  }` : '{}';

  const stages = opts.rampUp
    .map((s) => `    { duration: '${s.duration}', target: ${s.target} },`)
    .join('\n');

  const thresholds = opts.slo
    .map((t) => {
      const key = sloMetricToK6Key(t.metric);
      const abort = t.abortOnFail ? `, abortOnFail: true` : '';
      return `    '${key}': [{ threshold: '${t.op.replace('<=', '<').replace('>=', '>')}${formatK6Value(t.metric, t.value)}'${abort} }],`;
    })
    .join('\n');

  const thresholdBlock = thresholds
    ? `\n  thresholds: {\n${thresholds}\n  },`
    : '';

  const profileHeader = opts.profilerIntegration
    ? ` * - Profiler integration: timestamps emitted via console.log for correlation
 *   with \`manifest profile\` output.`
    : '';

  return `/**
 * k6 load test for ${entityName}.${command.name}
 * Generated by \`manifest load-test\`
 *
 * Ramp-up: ${opts.rampUp.map((s) => `${s.duration}@${s.target}VU`).join(' → ')}
 * SLO: ${opts.slo.length > 0 ? opts.slo.map((t) => `${t.metric} ${t.op} ${t.value}`).join(', ') : 'none'}${profileHeader}
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';

${FAKER_HELPERS_JS}

export const options = {
  stages: [
${stages}
  ],${thresholdBlock}
};

const BASE_URL = __ENV.BASE_URL || '${opts.baseUrl}';
const TIMEOUT = '${opts.timeout}ms';

export default function () {
  group('${entityName}.${command.name}', function () {
    const payload = JSON.stringify(${bodyObj});

    const params = {
      headers: { 'Content-Type': 'application/json' },
      tags: { command: '${command.name}', entity: '${entityName}' },
      timeout: TIMEOUT,
    };

    const res = http.post(\`\${BASE_URL}/api/${pathSuffix}\`, payload, params);

${opts.profilerIntegration ? `    // Emit per-request timing for profiler correlation\n    console.log(\`profile phase=action duration=\${res.timings.duration} cmd=${command.name} vu=\${__VU} iter=\${__ITER}\`);` : ''}

    check(res, {
      'status is 2xx': (r) => r.status >= 200 && r.status < 300,
      'response time < 2s': (r) => r.timings.duration < 2000,
    });
  });

  sleep(0.1);
}
`;
}

function commandNameToPath(name: string): string {
  // Convert camelCase / PascalCase command names to kebab-case URL segments.
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function sloMetricToK6Key(metric: string): string {
  if (metric === 'p95') return 'http_req_duration{expected_response:true}';
  if (metric === 'p99') return 'http_req_duration{expected_response:true}';
  if (metric === 'p50') return 'http_req_duration{expected_response:true}';
  if (metric === 'error_rate') return 'http_req_failed';
  if (metric === 'http_req_duration') return 'http_req_duration';
  if (metric.startsWith('http_')) return metric;
  return `http_req_duration{name:"${metric}"}`;
}

function formatK6Value(metric: string, value: number): string {
  if (metric === 'error_rate') return `${value}`;
  return `${value}ms`;
}

// ---------- Artillery generator ----------

function generateArtilleryConfig(
  entityName: string,
  command: IRCommand,
  opts: {
    baseUrl: string;
    rampUp: RampStage[];
    slo: SloThreshold[];
  }
): string {
  const pathSuffix = commandNameToPath(command.name);

  const phases = opts.rampUp
    .map((s) => `      - duration: ${s.duration}\n        arrivalRate: ${Math.max(1, Math.floor(s.target / 10))}`)
    .join('\n');

  // Artillery does not have native SLO thresholds like k6, so we encode them
  // as a configurable block in the processor.
  const sloBlock = JSON.stringify(opts.slo, null, 4)
    .split('\n')
    .map((l) => '  ' + l)
    .join('\n');

  return `config:
  target: '${opts.baseUrl}'
  phases:
${phases}
  defaults:
    headers:
      Content-Type: 'application/json'
  plugins:
    metrics-by-endpoint:
      useOnlyRequestNames: true
  variables:
    __slo_thresholds: |
${sloBlock}

scenarios:
  - name: '${entityName}.${command.name}'
    flow:
      - post:
          url: '/api/${pathSuffix}'
          json:
            __placeholder: true   # Real data generated by processor.js
          expect:
            - statusCode: [200, 201, 202]
`;
}

function generateArtilleryProcessor(
  entityName: string,
  command: IRCommand,
  properties: IRProperty[],
  opts: { slo: SloThreshold[]; profilerIntegration: boolean }
): string {
  const bodyLines: string[] = [];
  for (const prop of properties) {
    if (prop.name === 'id') continue;
    const expr = generateFakerExpr(prop, entityName);
    bodyLines.push(`  ${prop.name}: ${expr},`);
  }
  const bodyObj = bodyLines.length > 0 ? `{\n${bodyLines.join('\n')}\n}` : '{}';

  const sloCheck = opts.slo.length > 0
    ? `

// SLO threshold evaluation (post-run check)
function evaluateSLOs(report) {
  const thresholds = ${JSON.stringify(opts.slo)};
  const violations = [];
  for (const t of thresholds) {
    let observed;
    if (t.metric === 'error_rate') {
      observed = (report.errors || 0) / Math.max(1, report.requestsCompleted);
    } else if (t.metric === 'p95' || t.metric === 'p99' || t.metric === 'p50') {
      const p = t.metric.replace('p', '');
      observed = report.latency && report.latency[p] ? report.latency[p] : 0;
    } else {
      observed = report[t.metric] || 0;
    }
    const passed = eval(\`\${observed} \${t.op} \${t.value}\`);
    if (!passed) {
      violations.push({ metric: t.metric, observed, threshold: t.value, op: t.op });
    }
  }
  return violations;
}`
    : '';

  const profileLog = opts.profilerIntegration
    ? `

// Emit per-request timing for profiler correlation
function logProfileTiming(requestParams, response, context, ee, next) {
  if (context.vars && context.vars.__profile) {
    console.log(\`profile phase=action duration=\${response.timings ? response.timings.response : 0} cmd=${command.name} vu=\${context.vars.$vu} iter=\${context.vars.$iter}\`);
  }
  return next();
}`
    : '';

  return `/**
 * Artillery processor for ${entityName}.${command.name}
 * Generated by \`manifest load-test\`
 */

${FAKER_HELPERS_JS}

// Generate a request body from the IR entity properties
function generateRequestBody(context, events, done) {
  context.vars.body = JSON.stringify(${bodyObj});
  return done();
}

module.exports = {
  generateRequestBody,${sloCheck ? '\n  evaluateSLOs,' : ''}${profileLog ? '\n  logProfileTiming,' : ''}
};
`;
}

// ---------- File writing ----------

function pickPropertiesForCommand(
  entity: IREntity,
  command: IRCommand
): IRProperty[] {
  // Collect property names referenced by the command.
  // The IR schema varies: some commands have `parameters` + `actions[].target`,
  // others have `mutations[].property`. Handle both.
  const referencedProps = new Set<string>();

  // From parameters
  const parameters = (command as Record<string, unknown>).parameters;
  if (Array.isArray(parameters)) {
    for (const p of parameters) {
      if (p && typeof p === 'object' && 'name' in p) {
        referencedProps.add(String((p as { name: string }).name));
      }
    }
  }

  // From mutations (old style: { kind: 'set', property: ... })
  const mutations = command.mutations || [];
  for (const m of mutations) {
    if (m && (m as Record<string, unknown>).kind === 'set' && (m as Record<string, unknown>).property) {
      referencedProps.add(String((m as Record<string, unknown>).property));
    }
  }

  // From actions (new style: { kind: 'mutate', target: ... })
  const actions = (command as Record<string, unknown>).actions;
  if (Array.isArray(actions)) {
    for (const a of actions) {
      if (a && typeof a === 'object') {
        const target = (a as Record<string, unknown>).target;
        if (typeof target === 'string') referencedProps.add(target);
      }
    }
  }

  if (referencedProps.size > 0) {
    return entity.properties.filter(
      (p) => p.name === 'id' || referencedProps.has(p.name)
    );
  }
  // Fallback: all non-id properties
  return entity.properties;
}

function findEntityForCommand(ir: IR, command: IRCommand): IREntity | undefined {
  return ir.entities.find((e) => e.name === command.entityName);
}

// ---------- Main command ----------

export async function loadTestCommand(options: LoadTestOptions = {}): Promise<LoadTestResult> {
  const spinner = ora('Loading IR').start();

  try {
    const format: LoadTestFormat = options.format || DEFAULT_FORMAT;
    if (format !== 'k6' && format !== 'artillery') {
      throw new Error(`Invalid format: ${format}. Use "k6" or "artillery".`);
    }

    const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    const rampUp = parseRampUp(options.rampUp);
    const slo = parseSlo(options.slo);
    const timeout = options.timeout || 30000;

    spinner.text = 'Loading IR';
    const ir = await loadIR(options.source);

    if (!ir.entities || ir.entities.length === 0) {
      spinner.warn('No entities found in IR');
      return {
        format,
        baseUrl,
        rampUp,
        slo,
        commands: [],
        entities: [],
        files: {},
        profilerIntegration: !!options.profile,
      };
    }

    const entities = pickEntities(ir, options.entity);
    const commands = pickCommands(ir, options.command);

    if (commands.length === 0) {
      spinner.warn('No commands found in IR');
      return {
        format,
        baseUrl,
        rampUp,
        slo,
        commands: [],
        entities: entities.map((e) => e.name),
        files: {},
        profilerIntegration: !!options.profile,
      };
    }

    spinner.text = `Generating ${format} scripts for ${commands.length} command(s)`;

    const outputDir = options.output
      ? path.resolve(process.cwd(), options.output)
      : path.resolve(process.cwd(), 'load-tests');

    const files: Record<string, string> = {};

    for (const cmd of commands) {
      const entity = findEntityForCommand(ir, cmd);
      const props = entity
        ? pickPropertiesForCommand(entity, cmd)
        : [];

      if (format === 'k6') {
        const script = generateK6Script(cmd.entityName || 'Unknown', cmd, props, {
          baseUrl,
          rampUp,
          slo,
          timeout,
          profilerIntegration: !!options.profile,
        });
        const fileName = `${(cmd.entityName || 'cmd').toLowerCase()}-${commandNameToPath(cmd.name)}.js`;
        const filePath = path.join(outputDir, fileName);
        files[filePath] = script;
      } else {
        // Artillery: generates two files per command (yaml + processor js)
        const yaml = generateArtilleryConfig(cmd.entityName || 'Unknown', cmd, {
          baseUrl,
          rampUp,
          slo,
        });
        const proc = generateArtilleryProcessor(cmd.entityName || 'Unknown', cmd, props, {
          slo,
          profilerIntegration: !!options.profile,
        });
        const baseName = `${(cmd.entityName || 'cmd').toLowerCase()}-${commandNameToPath(cmd.name)}`;
        files[path.join(outputDir, `${baseName}.yml`)] = yaml;
        files[path.join(outputDir, `${baseName}.processor.js`)] = proc;
      }
    }

    // Write all files
    if (!options.json) {
      await fs.mkdir(outputDir, { recursive: true });
      for (const [filePath, content] of Object.entries(files)) {
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    const result: LoadTestResult = {
      format,
      baseUrl,
      rampUp,
      slo,
      commands: commands.map((c) => `${c.entityName || ''}.${c.name}`.replace(/^\./, '')),
      entities: entities.map((e) => e.name),
      files,
      profilerIntegration: !!options.profile,
    };

    if (options.json) {
      // For JSON output, don't include full file contents in stdout — too large.
      const compact = { ...result, files: Object.fromEntries(Object.keys(files).map((k) => [k, '<generated>'])) };
      console.log(JSON.stringify(compact, null, 2));
      spinner.succeed(`Generated ${Object.keys(files).length} file(s) for ${commands.length} command(s)`);
      return result;
    }

    spinner.succeed(`Generated ${Object.keys(files).length} file(s) → ${path.relative(process.cwd(), outputDir)}`);

    // Human summary
    console.log('');
    console.log(chalk.bold('Load test summary:'));
    console.log(`  ${chalk.gray('Format:')}    ${format}`);
    console.log(`  ${chalk.gray('Base URL:')}  ${baseUrl}`);
    console.log(`  ${chalk.gray('Ramp-up:')}   ${rampUp.map((s) => `${s.duration}@${s.target}VU`).join(' → ')}`);
    if (slo.length > 0) {
      console.log(`  ${chalk.gray('SLO:')}       ${slo.map((t) => `${t.metric} ${t.op} ${t.value}`).join(', ')}`);
    }
    if (options.profile) {
      console.log(`  ${chalk.gray('Profiler:')}  integration enabled`);
    }
    console.log(`  ${chalk.gray('Commands:')}  ${result.commands.join(', ')}`);
    console.log(`  ${chalk.gray('Output:')}    ${path.relative(process.cwd(), outputDir)}`);

    if (format === 'k6') {
      const firstFile = Object.keys(files)[0];
      if (firstFile) {
        console.log('');
        console.log(chalk.gray('Run with:'));
        console.log(chalk.white(`  k6 run ${path.relative(process.cwd(), firstFile)}`));
      }
    } else {
      const ymlFile = Object.keys(files).find((f) => f.endsWith('.yml'));
      if (ymlFile) {
        console.log('');
        console.log(chalk.gray('Run with:'));
        console.log(chalk.white(`  artillery run ${path.relative(process.cwd(), ymlFile)}`));
      }
    }

    return result;
  } catch (error: unknown) {
    spinner.fail(`Load test generation failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
