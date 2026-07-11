/**
 * manifest docs command
 *
 * Generates a static documentation site from Manifest IR.
 * Each entity gets a reference page with property tables, command signatures,
 * policy rules, constraint details, and event listings.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import ora from 'ora';

// Import from the main Manifest package
async function loadCompiler() {
  const module = await import('@angriff36/manifest/ir-compiler');
  return { compileToIR: module.compileToIR };
}

interface DocsOptions {
  output?: string;
  format?: 'html' | 'markdown';
  title?: string;
}

// Re-declare minimal IR types to avoid coupling to the main package's internal
// module layout. These match the shapes in src/manifest/ir.ts.
interface IRType {
  name: string;
  generic?: IRType;
  nullable: boolean;
  params?: Record<string, number>;
}

interface IRValue {
  kind: string;
  value?: unknown;
  elements?: IRValue[];
  properties?: Record<string, IRValue>;
}

interface IRExpression {
  kind: string;
  value?: IRValue;
  name?: string;
  object?: IRExpression;
  property?: string;
  operator?: string;
  left?: IRExpression;
  right?: IRExpression;
  operand?: IRExpression;
  callee?: IRExpression;
  args?: IRExpression[];
  condition?: IRExpression;
  consequent?: IRExpression;
  alternate?: IRExpression;
  elements?: IRExpression[];
  properties?: { key: string; value: IRExpression }[];
  params?: string[];
  body?: IRExpression;
}

interface IRProperty {
  name: string;
  type: IRType;
  defaultValue?: IRValue;
  modifiers: string[];
}

interface IRComputedProperty {
  name: string;
  type: IRType;
  expression: IRExpression;
  dependencies: string[];
}

interface IRRelationship {
  name: string;
  kind: string;
  target: string;
  foreignKey?: { fields: string[]; references?: string[] };
  through?: string;
  onDelete?: string;
  onUpdate?: string;
}

interface IRConstraint {
  name: string;
  code: string;
  expression: IRExpression;
  severity?: string;
  message?: string;
}

interface IRParameter {
  name: string;
  type: IRType;
  required: boolean;
  defaultValue?: IRValue;
}

interface IRAction {
  kind: string;
  target?: string;
  expression: IRExpression;
}

interface IRCommand {
  name: string;
  module?: string;
  entity?: string;
  parameters: IRParameter[];
  guards: IRExpression[];
  constraints?: IRConstraint[];
  policies?: string[];
  actions: IRAction[];
  emits: string[];
  returns?: IRType;
}

interface IRPolicy {
  name: string;
  module?: string;
  entity?: string;
  action: string;
  expression: IRExpression;
  message?: string;
}

interface IREvent {
  name: string;
  channel: string;
  payload: IRType | Array<{ name: string; type: IRType; required: boolean }>;
}

interface IRStore {
  entity: string;
  target: string;
  config: Record<string, IRValue>;
}

interface IREntity {
  name: string;
  module?: string;
  properties: IRProperty[];
  computedProperties: IRComputedProperty[];
  relationships: IRRelationship[];
  commands: string[];
  constraints: IRConstraint[];
  policies: string[];
  defaultPolicies?: string[];
  key?: string[];
  transitions?: Array<{ property: string; from: string; to: string[] }>;
}

interface IR {
  version: string;
  provenance: {
    contentHash: string;
    compilerVersion: string;
    schemaVersion: string;
    compiledAt: string;
  };
  modules: Array<{ name: string; entities: string[] }>;
  entities: IREntity[];
  stores: IRStore[];
  events: IREvent[];
  commands: IRCommand[];
  policies: IRPolicy[];
}

/**
 * Load IR from a file (either .manifest source or .ir.json)
 */
async function loadIR(filePath: string): Promise<IR> {
  const resolved = path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(resolved, 'utf-8');

  if (filePath.endsWith('.manifest')) {
    const { compileToIR } = await loadCompiler();
    const result = await compileToIR(content, { sourcePath: resolved });
    if (!result.ir) {
      const errors = (result.diagnostics || [])
        .filter((d: { severity?: string }) => d.severity === 'error')
        .map((d: { message?: string }) => d.message)
        .join('\n');
      throw new Error(`Compilation failed:\n${errors}`);
    }
    return result.ir as IR;
  }

  return JSON.parse(content) as IR;
}

/**
 * Get all input files (manifest or IR)
 */
async function getInputFiles(source: string): Promise<string[]> {
  const resolved = path.resolve(process.cwd(), source);
  const stat = await fs.stat(resolved).catch(() => null);

  if (!stat) {
    throw new Error(`Source not found: ${source}`);
  }

  if (stat.isFile()) {
    return [resolved];
  }

  // Directory: find both .manifest and .ir.json files
  const manifestFiles = await glob('**/*.manifest', { cwd: resolved });
  const irFiles = await glob('**/*.ir.json', { cwd: resolved });
  const all = [...manifestFiles, ...irFiles];
  return all.map((f) => path.join(resolved, f));
}

// ─── Expression formatting ──────────────────────────────────────────────

function formatExpression(expr: IRExpression): string {
  switch (expr.kind) {
    case 'literal':
      return formatValue(expr.value!);
    case 'identifier':
      return expr.name!;
    case 'member':
      return `${formatExpression(expr.object!)}.${expr.property}`;
    case 'binary':
      return `${formatExpression(expr.left!)} ${expr.operator} ${formatExpression(expr.right!)}`;
    case 'unary':
      return `${expr.operator}${formatExpression(expr.operand!)}`;
    case 'call':
      return `${formatExpression(expr.callee!)}(${(expr.args || []).map(formatExpression).join(', ')})`;
    case 'conditional':
      return `${formatExpression(expr.condition!)} ? ${formatExpression(expr.consequent!)} : ${formatExpression(expr.alternate!)}`;
    case 'array':
      return `[${(expr.elements || []).map(formatExpression).join(', ')}]`;
    case 'object':
      return `{ ${(expr.properties || []).map((p) => `${p.key}: ${formatExpression(p.value)}`).join(', ')} }`;
    case 'lambda':
      return `(${(expr.params || []).join(', ')}) => ${formatExpression(expr.body!)}`;
    default:
      return JSON.stringify(expr);
  }
}

function formatValue(val: IRValue): string {
  switch (val.kind) {
    case 'string':
      return `"${val.value}"`;
    case 'number':
    case 'boolean':
      return String(val.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${(val.elements || []).map(formatValue).join(', ')}]`;
    case 'object': {
      const entries = Object.entries(val.properties || {});
      return `{ ${entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')} }`;
    }
    default:
      return JSON.stringify(val);
  }
}

function formatType(type: IRType): string {
  let base = type.name;
  if (type.generic) {
    base += `<${formatType(type.generic)}>`;
  }
  if (type.params) {
    const paramStr = Object.entries(type.params)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    base += `(${paramStr})`;
  }
  if (type.nullable) {
    base += '?';
  }
  return base;
}

// ─── Escape helpers ─────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMarkdown(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ─── HTML generation ────────────────────────────────────────────────────

function generateEntityPageHtml(
  entity: IREntity,
  commands: IRCommand[],
  policies: IRPolicy[],
  events: IREvent[],
  stores: IRStore[],
  siteTitle: string,
): string {
  const entityCommands = commands.filter((c) => c.entity === entity.name);
  const commandPolicyNames = new Set(entityCommands.flatMap((c) => c.policies || []));
  const entityPolicies = policies.filter(
    (p) =>
      p.entity === entity.name ||
      entity.policies.includes(p.name) ||
      (entity.defaultPolicies || []).includes(p.name) ||
      commandPolicyNames.has(p.name) ||
      (!p.entity && !p.module),
  );
  const entityEvents = events.filter((e) => entityCommands.some((c) => c.emits.includes(e.name)));
  const entityStore = stores.find((s) => s.entity === entity.name);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(entity.name)} - ${escapeHtml(siteTitle)}</title>
<style>
${getStyles()}
</style>
</head>
<body>
<nav class="sidebar">
  <a href="index.html" class="nav-title">${escapeHtml(siteTitle)}</a>
</nav>
<main>
<h1>${escapeHtml(entity.name)}</h1>
${entity.module ? `<p class="module-badge">Module: <code>${escapeHtml(entity.module)}</code></p>` : ''}
${entity.key ? `<p class="meta">Primary Key: <code>${escapeHtml(entity.key.join(', '))}</code></p>` : ''}
${entityStore ? `<p class="meta">Store: <code>${escapeHtml(entityStore.target)}</code></p>` : ''}

${renderPropertiesSection(entity.properties)}
${renderComputedPropertiesSection(entity.computedProperties)}
${renderRelationshipsSection(entity.relationships)}
${renderConstraintsSection(entity.constraints)}
${renderCommandsSection(entityCommands)}
${renderPoliciesSection(entityPolicies)}
${renderEventsSection(entityEvents)}
${renderTransitionsSection(entity.transitions)}
</main>
</body>
</html>`;
}

function generateIndexPageHtml(ir: IR, siteTitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(siteTitle)}</title>
<style>
${getStyles()}
</style>
</head>
<body>
<nav class="sidebar">
  <a href="index.html" class="nav-title">${escapeHtml(siteTitle)}</a>
</nav>
<main>
<h1>${escapeHtml(siteTitle)}</h1>
<p class="meta">Compiled with Manifest v${escapeHtml(ir.provenance.compilerVersion)} | Schema v${escapeHtml(ir.provenance.schemaVersion)}</p>

<h2>Entities</h2>
<ul class="entity-list">
${ir.entities.map((e) => `  <li><a href="${encodeURIComponent(e.name)}.html">${escapeHtml(e.name)}</a>${e.module ? ` <span class="module-badge">${escapeHtml(e.module)}</span>` : ''} &mdash; ${e.properties.length} properties, ${e.commands.length} commands</li>`).join('\n')}
</ul>

${
  ir.modules.length > 0
    ? `
<h2>Modules</h2>
<ul>
${ir.modules.map((m) => `  <li><strong>${escapeHtml(m.name)}</strong> &mdash; ${m.entities.length} entities</li>`).join('\n')}
</ul>
`
    : ''
}

<h2>Summary</h2>
<table>
<thead><tr><th>Concept</th><th>Count</th></tr></thead>
<tbody>
<tr><td>Entities</td><td>${ir.entities.length}</td></tr>
<tr><td>Commands</td><td>${ir.commands.length}</td></tr>
<tr><td>Policies</td><td>${ir.policies.length}</td></tr>
<tr><td>Events</td><td>${ir.events.length}</td></tr>
<tr><td>Stores</td><td>${ir.stores.length}</td></tr>
</tbody>
</table>
</main>
</body>
</html>`;
}

function renderPropertiesSection(properties: IRProperty[]): string {
  if (properties.length === 0) return '';
  return `
<h2>Properties</h2>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Modifiers</th><th>Default</th></tr></thead>
<tbody>
${properties
  .map(
    (p) => `<tr>
  <td><code>${escapeHtml(p.name)}</code></td>
  <td><code>${escapeHtml(formatType(p.type))}</code></td>
  <td>${p.modifiers.length > 0 ? p.modifiers.map((m) => `<span class="badge">${escapeHtml(m)}</span>`).join(' ') : '&mdash;'}</td>
  <td>${p.defaultValue ? `<code>${escapeHtml(formatValue(p.defaultValue))}</code>` : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
}

function renderComputedPropertiesSection(computedProperties: IRComputedProperty[]): string {
  if (computedProperties.length === 0) return '';
  return `
<h2>Computed Properties</h2>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Expression</th><th>Dependencies</th></tr></thead>
<tbody>
${computedProperties
  .map(
    (cp) => `<tr>
  <td><code>${escapeHtml(cp.name)}</code></td>
  <td><code>${escapeHtml(formatType(cp.type))}</code></td>
  <td><code>${escapeHtml(formatExpression(cp.expression))}</code></td>
  <td>${cp.dependencies.length > 0 ? cp.dependencies.map((d) => `<code>${escapeHtml(d)}</code>`).join(', ') : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
}

function renderRelationshipsSection(relationships: IRRelationship[]): string {
  if (relationships.length === 0) return '';
  return `
<h2>Relationships</h2>
<table>
<thead><tr><th>Name</th><th>Kind</th><th>Target</th><th>FK / Through</th><th>On Delete</th></tr></thead>
<tbody>
${relationships
  .map((r) => {
    let fkInfo = '&mdash;';
    if (r.foreignKey) {
      fkInfo = `fields: [${r.foreignKey.fields.join(', ')}]`;
      if (r.foreignKey.references) {
        fkInfo += ` &rarr; [${r.foreignKey.references.join(', ')}]`;
      }
    } else if (r.through) {
      fkInfo = `through: ${r.through}`;
    }
    return `<tr>
  <td><code>${escapeHtml(r.name)}</code></td>
  <td><span class="badge">${escapeHtml(r.kind)}</span></td>
  <td><code>${escapeHtml(r.target)}</code></td>
  <td>${fkInfo}</td>
  <td>${r.onDelete ? escapeHtml(r.onDelete) : '&mdash;'}</td>
</tr>`;
  })
  .join('\n')}
</tbody>
</table>`;
}

function renderConstraintsSection(constraints: IRConstraint[]): string {
  if (constraints.length === 0) return '';
  return `
<h2>Constraints</h2>
<table>
<thead><tr><th>Name</th><th>Code</th><th>Severity</th><th>Expression</th><th>Message</th></tr></thead>
<tbody>
${constraints
  .map(
    (c) => `<tr>
  <td><code>${escapeHtml(c.name)}</code></td>
  <td><code>${escapeHtml(c.code)}</code></td>
  <td><span class="badge badge-${c.severity || 'block'}">${escapeHtml(c.severity || 'block')}</span></td>
  <td><code>${escapeHtml(formatExpression(c.expression))}</code></td>
  <td>${c.message ? escapeHtml(c.message) : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
}

function renderCommandsSection(commands: IRCommand[]): string {
  if (commands.length === 0) return '';
  return `
<h2>Commands</h2>
${commands
  .map(
    (cmd) => `
<div class="command-card">
<h3><code>${escapeHtml(cmd.name)}</code></h3>
${cmd.policies && cmd.policies.length > 0 ? `<p class="meta">Policies: ${cmd.policies.map((p) => `<code>${escapeHtml(p)}</code>`).join(', ')}</p>` : ''}
${cmd.emits.length > 0 ? `<p class="meta">Emits: ${cmd.emits.map((e) => `<code>${escapeHtml(e)}</code>`).join(', ')}</p>` : ''}
${cmd.returns ? `<p class="meta">Returns: <code>${escapeHtml(formatType(cmd.returns))}</code></p>` : ''}

${
  cmd.parameters.length > 0
    ? `
<h4>Parameters</h4>
<table>
<thead><tr><th>Name</th><th>Type</th><th>Required</th><th>Default</th></tr></thead>
<tbody>
${cmd.parameters
  .map(
    (p) => `<tr>
  <td><code>${escapeHtml(p.name)}</code></td>
  <td><code>${escapeHtml(formatType(p.type))}</code></td>
  <td>${p.required ? 'Yes' : 'No'}</td>
  <td>${p.defaultValue ? `<code>${escapeHtml(formatValue(p.defaultValue))}</code>` : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>
`
    : ''
}

${
  cmd.guards.length > 0
    ? `
<h4>Guards</h4>
<ol class="guard-list">
${cmd.guards.map((g) => `  <li><code>${escapeHtml(formatExpression(g))}</code></li>`).join('\n')}
</ol>
`
    : ''
}

${
  cmd.actions.length > 0
    ? `
<h4>Actions</h4>
<ol class="action-list">
${cmd.actions.map((a) => `  <li><span class="badge">${escapeHtml(a.kind)}</span>${a.target ? ` <code>${escapeHtml(a.target)}</code>` : ''} &larr; <code>${escapeHtml(formatExpression(a.expression))}</code></li>`).join('\n')}
</ol>
`
    : ''
}

${
  (cmd.constraints || []).length > 0
    ? `
<h4>Command Constraints</h4>
<table>
<thead><tr><th>Name</th><th>Severity</th><th>Expression</th><th>Message</th></tr></thead>
<tbody>
${(cmd.constraints || [])
  .map(
    (c) => `<tr>
  <td><code>${escapeHtml(c.name)}</code></td>
  <td><span class="badge badge-${c.severity || 'block'}">${escapeHtml(c.severity || 'block')}</span></td>
  <td><code>${escapeHtml(formatExpression(c.expression))}</code></td>
  <td>${c.message ? escapeHtml(c.message) : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>
`
    : ''
}
</div>
`,
  )
  .join('\n')}`;
}

function renderPoliciesSection(policies: IRPolicy[]): string {
  if (policies.length === 0) return '';
  return `
<h2>Policies</h2>
<table>
<thead><tr><th>Name</th><th>Action</th><th>Expression</th><th>Message</th></tr></thead>
<tbody>
${policies
  .map(
    (p) => `<tr>
  <td><code>${escapeHtml(p.name)}</code></td>
  <td><span class="badge">${escapeHtml(p.action)}</span></td>
  <td><code>${escapeHtml(formatExpression(p.expression))}</code></td>
  <td>${p.message ? escapeHtml(p.message) : '&mdash;'}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
}

function renderEventsSection(events: IREvent[]): string {
  if (events.length === 0) return '';
  return `
<h2>Events</h2>
<table>
<thead><tr><th>Name</th><th>Channel</th><th>Payload</th></tr></thead>
<tbody>
${events
  .map((e) => {
    let payloadStr: string;
    if (Array.isArray(e.payload)) {
      payloadStr = e.payload
        .map((f) => `${f.name}: ${formatType(f.type)}${f.required ? '' : '?'}`)
        .join(', ');
    } else {
      payloadStr = formatType(e.payload);
    }
    return `<tr>
  <td><code>${escapeHtml(e.name)}</code></td>
  <td><code>${escapeHtml(e.channel)}</code></td>
  <td><code>${escapeHtml(payloadStr)}</code></td>
</tr>`;
  })
  .join('\n')}
</tbody>
</table>`;
}

function renderTransitionsSection(
  transitions?: Array<{ property: string; from: string; to: string[] }>,
): string {
  if (!transitions || transitions.length === 0) return '';
  return `
<h2>State Transitions</h2>
<table>
<thead><tr><th>Property</th><th>From</th><th>To</th></tr></thead>
<tbody>
${transitions
  .map(
    (t) => `<tr>
  <td><code>${escapeHtml(t.property)}</code></td>
  <td><code>${escapeHtml(t.from)}</code></td>
  <td>${t.to.map((v) => `<code>${escapeHtml(v)}</code>`).join(', ')}</td>
</tr>`,
  )
  .join('\n')}
</tbody>
</table>`;
}

function getStyles(): string {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #f8f9fa; line-height: 1.6; display: flex; }
.sidebar { width: 240px; min-height: 100vh; background: #1a1a2e; padding: 20px; position: fixed; }
.nav-title { color: #fff; text-decoration: none; font-size: 18px; font-weight: 600; display: block; margin-bottom: 16px; }
main { margin-left: 240px; padding: 40px; max-width: 960px; width: 100%; }
h1 { font-size: 28px; margin-bottom: 8px; color: #1a1a2e; }
h2 { font-size: 20px; margin: 32px 0 12px; color: #1a1a2e; border-bottom: 1px solid #dee2e6; padding-bottom: 6px; }
h3 { font-size: 17px; margin: 16px 0 8px; }
h4 { font-size: 14px; margin: 12px 0 6px; color: #495057; }
p { margin-bottom: 8px; }
.meta { font-size: 14px; color: #6c757d; }
code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; background: #e9ecef; padding: 1px 5px; border-radius: 3px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 14px; }
th, td { text-align: left; padding: 8px 12px; border: 1px solid #dee2e6; }
th { background: #e9ecef; font-weight: 600; }
tr:nth-child(even) { background: #f8f9fa; }
.badge { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 3px; background: #e9ecef; color: #495057; font-weight: 500; }
.badge-block { background: #f8d7da; color: #842029; }
.badge-warn { background: #fff3cd; color: #664d03; }
.badge-ok { background: #d1e7dd; color: #0f5132; }
.module-badge { font-size: 12px; color: #6c757d; }
.command-card { background: #fff; border: 1px solid #dee2e6; border-radius: 6px; padding: 16px; margin: 12px 0; }
.guard-list, .action-list { padding-left: 20px; margin: 4px 0 12px; }
.guard-list li, .action-list li { margin: 4px 0; }
.entity-list { list-style: none; padding: 0; }
.entity-list li { padding: 6px 0; border-bottom: 1px solid #e9ecef; }
.entity-list a { color: #0d6efd; text-decoration: none; font-weight: 500; }
.entity-list a:hover { text-decoration: underline; }
  `.trim();
}

// ─── Markdown generation ────────────────────────────────────────────────

function generateEntityPageMarkdown(
  entity: IREntity,
  commands: IRCommand[],
  policies: IRPolicy[],
  events: IREvent[],
  stores: IRStore[],
): string {
  const entityCommands = commands.filter((c) => c.entity === entity.name);
  const commandPolicyNames = new Set(entityCommands.flatMap((c) => c.policies || []));
  const entityPolicies = policies.filter(
    (p) =>
      p.entity === entity.name ||
      entity.policies.includes(p.name) ||
      (entity.defaultPolicies || []).includes(p.name) ||
      commandPolicyNames.has(p.name) ||
      (!p.entity && !p.module),
  );
  const entityEvents = events.filter((e) => entityCommands.some((c) => c.emits.includes(e.name)));
  const entityStore = stores.find((s) => s.entity === entity.name);

  const lines: string[] = [];

  lines.push(`# ${entity.name}`);
  lines.push('');
  if (entity.module) lines.push(`**Module:** \`${entity.module}\``);
  if (entity.key) lines.push(`**Primary Key:** \`${entity.key.join(', ')}\``);
  if (entityStore) lines.push(`**Store:** \`${entityStore.target}\``);
  lines.push('');

  // Properties
  if (entity.properties.length > 0) {
    lines.push('## Properties');
    lines.push('');
    lines.push('| Name | Type | Modifiers | Default |');
    lines.push('|------|------|-----------|---------|');
    for (const p of entity.properties) {
      const mods = p.modifiers.length > 0 ? p.modifiers.join(', ') : '\u2014';
      const def = p.defaultValue ? `\`${escapeMarkdown(formatValue(p.defaultValue))}\`` : '\u2014';
      lines.push(
        `| \`${escapeMarkdown(p.name)}\` | \`${escapeMarkdown(formatType(p.type))}\` | ${mods} | ${def} |`,
      );
    }
    lines.push('');
  }

  // Computed Properties
  if (entity.computedProperties.length > 0) {
    lines.push('## Computed Properties');
    lines.push('');
    lines.push('| Name | Type | Expression | Dependencies |');
    lines.push('|------|------|------------|--------------|');
    for (const cp of entity.computedProperties) {
      const deps =
        cp.dependencies.length > 0 ? cp.dependencies.map((d) => `\`${d}\``).join(', ') : '\u2014';
      lines.push(
        `| \`${escapeMarkdown(cp.name)}\` | \`${escapeMarkdown(formatType(cp.type))}\` | \`${escapeMarkdown(formatExpression(cp.expression))}\` | ${deps} |`,
      );
    }
    lines.push('');
  }

  // Relationships
  if (entity.relationships.length > 0) {
    lines.push('## Relationships');
    lines.push('');
    lines.push('| Name | Kind | Target | FK / Through | On Delete |');
    lines.push('|------|------|--------|-------------|-----------|');
    for (const r of entity.relationships) {
      let fkInfo = '\u2014';
      if (r.foreignKey) {
        fkInfo = `fields: [${r.foreignKey.fields.join(', ')}]`;
        if (r.foreignKey.references) fkInfo += ` -> [${r.foreignKey.references.join(', ')}]`;
      } else if (r.through) {
        fkInfo = `through: ${r.through}`;
      }
      lines.push(
        `| \`${escapeMarkdown(r.name)}\` | ${escapeMarkdown(r.kind)} | \`${escapeMarkdown(r.target)}\` | ${escapeMarkdown(fkInfo)} | ${r.onDelete || '\u2014'} |`,
      );
    }
    lines.push('');
  }

  // Constraints
  if (entity.constraints.length > 0) {
    lines.push('## Constraints');
    lines.push('');
    lines.push('| Name | Code | Severity | Expression | Message |');
    lines.push('|------|------|----------|------------|---------|');
    for (const c of entity.constraints) {
      lines.push(
        `| \`${escapeMarkdown(c.name)}\` | \`${escapeMarkdown(c.code)}\` | ${c.severity || 'block'} | \`${escapeMarkdown(formatExpression(c.expression))}\` | ${c.message ? escapeMarkdown(c.message) : '\u2014'} |`,
      );
    }
    lines.push('');
  }

  // Commands
  if (entityCommands.length > 0) {
    lines.push('## Commands');
    lines.push('');
    for (const cmd of entityCommands) {
      lines.push(`### \`${cmd.name}\``);
      lines.push('');
      if (cmd.policies && cmd.policies.length > 0) {
        lines.push(`**Policies:** ${cmd.policies.map((p) => `\`${p}\``).join(', ')}`);
      }
      if (cmd.emits.length > 0) {
        lines.push(`**Emits:** ${cmd.emits.map((e) => `\`${e}\``).join(', ')}`);
      }
      if (cmd.returns) {
        lines.push(`**Returns:** \`${formatType(cmd.returns)}\``);
      }
      lines.push('');

      if (cmd.parameters.length > 0) {
        lines.push('#### Parameters');
        lines.push('');
        lines.push('| Name | Type | Required | Default |');
        lines.push('|------|------|----------|---------|');
        for (const p of cmd.parameters) {
          const def = p.defaultValue
            ? `\`${escapeMarkdown(formatValue(p.defaultValue))}\``
            : '\u2014';
          lines.push(
            `| \`${escapeMarkdown(p.name)}\` | \`${escapeMarkdown(formatType(p.type))}\` | ${p.required ? 'Yes' : 'No'} | ${def} |`,
          );
        }
        lines.push('');
      }

      if (cmd.guards.length > 0) {
        lines.push('#### Guards');
        lines.push('');
        for (let i = 0; i < cmd.guards.length; i++) {
          lines.push(`${i + 1}. \`${escapeMarkdown(formatExpression(cmd.guards[i]))}\``);
        }
        lines.push('');
      }

      if (cmd.actions.length > 0) {
        lines.push('#### Actions');
        lines.push('');
        for (const a of cmd.actions) {
          lines.push(
            `- **${a.kind}**${a.target ? ` \`${a.target}\`` : ''} \u2190 \`${escapeMarkdown(formatExpression(a.expression))}\``,
          );
        }
        lines.push('');
      }
    }
  }

  // Policies
  if (entityPolicies.length > 0) {
    lines.push('## Policies');
    lines.push('');
    lines.push('| Name | Action | Expression | Message |');
    lines.push('|------|--------|------------|---------|');
    for (const p of entityPolicies) {
      lines.push(
        `| \`${escapeMarkdown(p.name)}\` | ${escapeMarkdown(p.action)} | \`${escapeMarkdown(formatExpression(p.expression))}\` | ${p.message ? escapeMarkdown(p.message) : '\u2014'} |`,
      );
    }
    lines.push('');
  }

  // Events
  if (entityEvents.length > 0) {
    lines.push('## Events');
    lines.push('');
    lines.push('| Name | Channel | Payload |');
    lines.push('|------|---------|---------|');
    for (const e of entityEvents) {
      let payloadStr: string;
      if (Array.isArray(e.payload)) {
        payloadStr = e.payload
          .map((f) => `${f.name}: ${formatType(f.type)}${f.required ? '' : '?'}`)
          .join(', ');
      } else {
        payloadStr = formatType(e.payload);
      }
      lines.push(
        `| \`${escapeMarkdown(e.name)}\` | \`${escapeMarkdown(e.channel)}\` | \`${escapeMarkdown(payloadStr)}\` |`,
      );
    }
    lines.push('');
  }

  // Transitions
  if (entity.transitions && entity.transitions.length > 0) {
    lines.push('## State Transitions');
    lines.push('');
    lines.push('| Property | From | To |');
    lines.push('|----------|------|----|');
    for (const t of entity.transitions) {
      lines.push(
        `| \`${escapeMarkdown(t.property)}\` | \`${escapeMarkdown(t.from)}\` | ${t.to.map((v) => `\`${escapeMarkdown(v)}\``).join(', ')} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateIndexPageMarkdown(ir: IR, siteTitle: string): string {
  const lines: string[] = [];

  lines.push(`# ${siteTitle}`);
  lines.push('');
  lines.push(
    `Compiled with Manifest v${ir.provenance.compilerVersion} | Schema v${ir.provenance.schemaVersion}`,
  );
  lines.push('');

  lines.push('## Entities');
  lines.push('');
  for (const e of ir.entities) {
    lines.push(
      `- [${e.name}](./${e.name}.md)${e.module ? ` *(${e.module})*` : ''} \u2014 ${e.properties.length} properties, ${e.commands.length} commands`,
    );
  }
  lines.push('');

  if (ir.modules.length > 0) {
    lines.push('## Modules');
    lines.push('');
    for (const m of ir.modules) {
      lines.push(`- **${m.name}** \u2014 ${m.entities.length} entities`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| Concept | Count |');
  lines.push('|---------|-------|');
  lines.push(`| Entities | ${ir.entities.length} |`);
  lines.push(`| Commands | ${ir.commands.length} |`);
  lines.push(`| Policies | ${ir.policies.length} |`);
  lines.push(`| Events | ${ir.events.length} |`);
  lines.push(`| Stores | ${ir.stores.length} |`);
  lines.push('');

  return lines.join('\n');
}

// ─── Command handler ────────────────────────────────────────────────────

/**
 * Generate documentation from IR or .manifest source files.
 */
export async function docsCommand(
  source: string | undefined,
  options: DocsOptions = {},
): Promise<void> {
  const spinner = ora('Preparing to generate documentation').start();
  const format = options.format || 'html';
  const siteTitle = options.title || 'Manifest API Reference';
  const outputDir = path.resolve(process.cwd(), options.output || 'docs/api');

  try {
    if (!source) {
      spinner.fail(
        'Source argument is required (path to .manifest file, .ir.json file, or directory)',
      );
      process.exitCode = 1;
      return;
    }

    // Collect all IRs
    const files = await getInputFiles(source);
    if (files.length === 0) {
      spinner.warn('No .manifest or .ir.json files found');
      return;
    }

    spinner.text = `Loading ${files.length} file(s)...`;

    // Merge all IRs into one
    const mergedIR: IR = {
      version: '1.0',
      provenance: {
        contentHash: '',
        compilerVersion: '',
        schemaVersion: '',
        compiledAt: new Date().toISOString(),
      },
      modules: [],
      entities: [],
      stores: [],
      events: [],
      commands: [],
      policies: [],
    };

    for (const file of files) {
      const ir = await loadIR(file);
      // Use first provenance as representative
      if (!mergedIR.provenance.compilerVersion) {
        mergedIR.provenance = ir.provenance;
      }
      mergedIR.modules.push(...ir.modules);
      mergedIR.entities.push(...ir.entities);
      mergedIR.stores.push(...ir.stores);
      mergedIR.events.push(...ir.events);
      mergedIR.commands.push(...ir.commands);
      mergedIR.policies.push(...ir.policies);
    }

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    const ext = format === 'markdown' ? 'md' : 'html';

    // Generate index page
    spinner.text = 'Generating index page...';
    const indexContent =
      format === 'markdown'
        ? generateIndexPageMarkdown(mergedIR, siteTitle)
        : generateIndexPageHtml(mergedIR, siteTitle);
    await fs.writeFile(path.join(outputDir, `index.${ext}`), indexContent, 'utf-8');

    // Generate entity pages
    let entityCount = 0;
    for (const entity of mergedIR.entities) {
      spinner.text = `Generating ${entity.name} reference...`;
      const content =
        format === 'markdown'
          ? generateEntityPageMarkdown(
              entity,
              mergedIR.commands,
              mergedIR.policies,
              mergedIR.events,
              mergedIR.stores,
            )
          : generateEntityPageHtml(
              entity,
              mergedIR.commands,
              mergedIR.policies,
              mergedIR.events,
              mergedIR.stores,
              siteTitle,
            );
      await fs.writeFile(path.join(outputDir, `${entity.name}.${ext}`), content, 'utf-8');
      entityCount++;
    }

    spinner.succeed(
      `Generated documentation: ${entityCount} entity page(s) + index → ${chalk.cyan(path.relative(process.cwd(), outputDir))}`,
    );
  } catch (error: unknown) {
    spinner.fail(
      `Documentation generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
