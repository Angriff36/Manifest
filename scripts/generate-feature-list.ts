import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { getLanguageMetadata, type LanguageMetadata } from '../src/manifest/language-metadata.js';
import {
  listProjectionDescriptors,
  type ProjectionDescriptor,
} from '../src/manifest/projections/registry.js';

export interface ConformanceInventoryEntry {
  id: string;
  fixture: string;
  evidence: string[];
}

export interface OpenGapInventoryEntry {
  category: string;
  feature: string;
  status: string;
  evidence: string;
}

export interface FeatureInventory {
  packageVersion: string;
  generatedFrom: string[];
  language: LanguageMetadata;
  projections: ProjectionDescriptor[];
  cliCommands: string[];
  conformance: ConformanceInventoryEntry[];
  packageExports: string[];
  openGaps: OpenGapInventoryEntry[];
}

interface PackageJsonShape {
  version: string;
  exports?: Record<string, unknown>;
}

const GENERATED_SOURCES = [
  'src/manifest/language-metadata.ts',
  'src/manifest/projections/registry.ts',
  'packages/cli/src/index.ts',
  'src/manifest/conformance/fixtures/',
  'package.json#exports',
  'docs/platform/FEATURE_MATRIX.md',
] as const;

function markdownCodeList(values: readonly string[]): string {
  return values.map((value) => `\`${value}\``).join(', ');
}

function tableCell(value: string): string {
  return value.split('|').join('\\|').split('\n').join(' ');
}

function unwrapRegisteredCommand(
  expression: ts.Expression,
  variablePaths: ReadonlyMap<string, string>,
): string | undefined {
  if (ts.isCallExpression(expression)) {
    if (
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.name.text === 'command' &&
      expression.arguments.length > 0 &&
      ts.isStringLiteralLike(expression.arguments[0])
    ) {
      const receiver = expression.expression.expression;
      if (!ts.isIdentifier(receiver)) return undefined;
      const parent = variablePaths.get(receiver.text);
      if (parent === undefined) return undefined;
      const name = expression.arguments[0].text.split(/[ <[]/, 1)[0];
      return parent ? `${parent} ${name}` : name;
    }
    if (ts.isPropertyAccessExpression(expression.expression)) {
      return unwrapRegisteredCommand(expression.expression.expression, variablePaths);
    }
  }
  return undefined;
}

export function collectCliCommandPaths(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'packages/cli/src/index.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const variablePaths = new Map<string, string>([['program', '']]);
  const commandPaths = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const path = unwrapRegisteredCommand(node.initializer, variablePaths);
      if (path !== undefined) {
        variablePaths.set(node.name.text, path);
      }
    }
    if (ts.isCallExpression(node)) {
      const path = unwrapRegisteredCommand(node, variablePaths);
      if (path !== undefined) commandPaths.add(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return [...commandPaths].sort((a, b) => a.localeCompare(b));
}

async function collectConformance(root: string): Promise<ConformanceInventoryEntry[]> {
  const fixtureDir = path.join(root, 'src/manifest/conformance/fixtures');
  const expectedDir = path.join(root, 'src/manifest/conformance/expected');
  const [fixtureFiles, expectedFiles] = await Promise.all([
    readdir(fixtureDir),
    readdir(expectedDir),
  ]);
  const expectedSet = new Set(expectedFiles);

  return fixtureFiles
    .filter((name) => name.endsWith('.manifest'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((fixture) => {
      const id = fixture.slice(0, -'.manifest'.length);
      const evidence = ['ir.json', 'diagnostics.json', 'results.json']
        .map((suffix) => `${id}.${suffix}`)
        .filter((name) => expectedSet.has(name));
      return { id, fixture, evidence };
    });
}

function collectOpenGaps(matrix: string): OpenGapInventoryEntry[] {
  const gaps = new Map<string, OpenGapInventoryEntry>();
  let category = 'Uncategorized';

  for (const line of matrix.split(/\r?\n/)) {
    const heading = line.match(/^## (\d+\. .+)$/);
    if (heading) {
      category = heading[1];
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3 || !/^\[[ x~]\]$/.test(cells[0])) continue;

    const status = cells[2];
    if (status.includes('FULLY_IMPLEMENTED') || status.includes('OUT_OF_SCOPE')) continue;
    const feature = cells[1];
    const key = feature.split('`').join('').toLowerCase();
    if (!gaps.has(key)) {
      gaps.set(key, {
        category,
        feature,
        status,
        evidence: cells.slice(3).join(' | '),
      });
    }
  }

  return [...gaps.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category, undefined, { numeric: true }) ||
      a.feature.localeCompare(b.feature),
  );
}

export async function collectFeatureInventory(root: string): Promise<FeatureInventory> {
  const [packageText, matrixText, cliSource, conformance] = await Promise.all([
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'docs/platform/FEATURE_MATRIX.md'), 'utf8'),
    readFile(path.join(root, 'packages/cli/src/index.ts'), 'utf8'),
    collectConformance(root),
  ]);
  const packageJson = JSON.parse(packageText) as PackageJsonShape;

  return {
    packageVersion: packageJson.version,
    generatedFrom: [...GENERATED_SOURCES],
    language: getLanguageMetadata(),
    projections: listProjectionDescriptors(),
    cliCommands: collectCliCommandPaths(cliSource),
    conformance,
    packageExports: Object.keys(packageJson.exports ?? {}).sort((a, b) => a.localeCompare(b)),
    openGaps: collectOpenGaps(matrixText),
  };
}

export function renderFeatureList(inventory: FeatureInventory): string {
  const declaredCapabilityCount = inventory.projections.filter(
    (projection) => projection.capabilities.declared,
  ).length;
  const lines: string[] = [
    '# Manifest Feature Inventory',
    '',
    '> Generated from live registries and evidence-bearing repository files. Do not edit this file by hand.',
    '> Run `pnpm docs:feature-list` to regenerate it or `pnpm docs:check:feature-list` to check drift.',
    '>',
    '> This document proves that a capability is registered or has executable evidence; it does **not** independently prove completion.',
    '> Completion status is governed by [`docs/platform/FEATURE_MATRIX.md`](platform/FEATURE_MATRIX.md). Language meaning is governed by `docs/spec/**`.',
    '',
    `Package version: \`${inventory.packageVersion}\``,
    '',
    'Generated sources:',
    '',
    ...inventory.generatedFrom.map((source) => `- \`${source}\``),
    '',
    '## Language discovery surface',
    '',
    `The public language-metadata registry currently reports ${inventory.language.topLevelConstructs.length + inventory.language.contextualTopLevelConstructs.length} top-level constructs, ${inventory.language.primitiveTypes.length} primitive types, ${inventory.language.modifiers.length} property modifiers, and ${inventory.language.builtins.length} runtime built-ins.`,
    '',
    '| Registry | Values |',
    '| --- | --- |',
    `| Top-level constructs | ${markdownCodeList([...inventory.language.topLevelConstructs, ...inventory.language.contextualTopLevelConstructs])} |`,
    `| Relationship kinds | ${markdownCodeList(inventory.language.relationshipKinds)} |`,
    `| Command/action constructs | ${markdownCodeList(inventory.language.commandActionConstructs)} |`,
    `| Primitive types | ${markdownCodeList(inventory.language.primitiveTypes)} |`,
    `| Property modifiers | ${markdownCodeList(inventory.language.modifiers)} |`,
    `| Contextual keywords | ${markdownCodeList(inventory.language.contextualKeywords)} |`,
    `| Operators | ${markdownCodeList(inventory.language.operators)} |`,
    `| Runtime built-ins | ${markdownCodeList(inventory.language.builtins.map((entry) => entry.name))} |`,
    '',
    '## Registered projections',
    '',
    `${inventory.projections.length} projections are registered. ${declaredCapabilityCount} declare a structured capability matrix; an undeclared matrix means “not yet declared,” not “unsupported.”`,
    '',
    '| Projection | Surfaces | Safe to invoke | Capabilities |',
    '| --- | --- | --- | --- |',
    ...inventory.projections.map((projection) => {
      const capabilities = projection.capabilities.declared
        ? `${projection.capabilities.supported.length} supported / ${projection.capabilities.partial.length} partial / ${projection.capabilities.unsupported.length} unsupported`
        : 'undeclared';
      return `| \`${tableCell(projection.name)}\` | ${tableCell(markdownCodeList(projection.surfaceIds))} | ${projection.safelyInvokable ? 'yes' : 'no'} | ${capabilities} |`;
    }),
    '',
    '## Registered CLI commands',
    '',
    `${inventory.cliCommands.length} built-in command paths are registered in Commander. Project-specific plugin commands are intentionally excluded.`,
    '',
    '| Command path |',
    '| --- |',
    ...inventory.cliCommands.map((command) => `| \`manifest ${tableCell(command)}\` |`),
    '',
    '## Conformance evidence',
    '',
    `${inventory.conformance.length} source fixtures are present. Expected IR, diagnostics, and results files are compiler-derived executable evidence; their presence is not a substitute for the matrix proof protocol.`,
    '',
    '| Fixture | Expected evidence |',
    '| --- | --- |',
    ...inventory.conformance.map(
      (entry) =>
        `| \`${entry.fixture}\` | ${entry.evidence.length > 0 ? markdownCodeList(entry.evidence) : '**missing expected artifact**'} |`,
    ),
    '',
    '## Published package export map',
    '',
    `${inventory.packageExports.length} package subpaths are declared in \`package.json#exports\`. A declared export is a distribution surface, not a completion claim.`,
    '',
    '| Export |',
    '| --- |',
    ...inventory.packageExports.map((exportName) => `| \`${tableCell(exportName)}\` |`),
    '',
    '## Open Manifest-owned gaps',
    '',
    'Generated from every non-complete Manifest-owned row in the binding `docs/platform/FEATURE_MATRIX.md`. Builder-owned `OUT_OF_SCOPE` items and proven `FULLY_IMPLEMENTED` rows are excluded.',
    '',
    '| Matrix section | Gap | Status | Evidence / disposition |',
    '| --- | --- | --- | --- |',
    ...inventory.openGaps.map(
      (gap) =>
        `| ${tableCell(gap.category)} | ${tableCell(gap.feature)} | \`${tableCell(gap.status)}\` | ${tableCell(gap.evidence || 'See feature matrix')} |`,
    ),
  ];

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputPath = path.join(root, 'docs/FEATURE-LIST.md');
  const rendered = renderFeatureList(await collectFeatureInventory(root));

  if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8');
    if (current !== rendered) {
      console.error('docs/FEATURE-LIST.md is stale. Run `pnpm docs:feature-list`.');
      process.exitCode = 1;
    }
    return;
  }

  await writeFile(outputPath, rendered, 'utf8');
}

const directPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (directPath === fileURLToPath(import.meta.url)) {
  await main();
}
