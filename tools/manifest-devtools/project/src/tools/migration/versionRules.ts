import type { RewriteRule } from './rewriteEngine';

export interface VersionInfo {
  version: string;
  label: string;
  releaseDate: string;
}

export const VERSIONS: VersionInfo[] = [
  { version: '0.1.0', label: 'v0.1.0 (Initial)', releaseDate: '2024-03-01' },
  { version: '0.2.0', label: 'v0.2.0 (Guards Revamp)', releaseDate: '2024-06-15' },
  { version: '0.3.0', label: 'v0.3.0 (Modern Syntax)', releaseDate: '2024-10-01' },
  { version: '1.0.0', label: 'v1.0.0 (Stable)', releaseDate: '2025-03-01' },
];

const RULES_0_1_TO_0_2: RewriteRule[] = [
  {
    id: 'guard-to-when',
    pattern: /\bguard\b/g,
    replacement: 'when',
    description: 'The `guard` keyword is renamed to `when` for clarity',
    severity: 'breaking',
    category: 'Keywords',
  },
  {
    id: 'arrow-syntax',
    pattern: /->/g,
    replacement: '=>',
    description: 'Match arms now use `=>` instead of `->`',
    severity: 'breaking',
    category: 'Syntax',
  },
  {
    id: 'string-interpolation',
    pattern: /\$\{([^}]+)\}/g,
    replacement: '{$1}',
    description: 'String interpolation changes from `${expr}` to `{expr}`',
    severity: 'warning',
    category: 'Strings',
  },
];

const RULES_0_2_TO_0_3: RewriteRule[] = [
  {
    id: 'fn-to-def',
    pattern: /\bfn\b/g,
    replacement: 'def',
    description: 'Function declarations use `def` instead of `fn`',
    severity: 'breaking',
    category: 'Keywords',
  },
  {
    id: 'let-to-val',
    pattern: /\blet\b/g,
    replacement: 'val',
    description: 'Bindings use `val` instead of `let` (immutable by default)',
    severity: 'breaking',
    category: 'Keywords',
  },
  {
    id: 'trailing-comma',
    pattern: /,(\s*[}\]])/g,
    replacement: '$1',
    description: 'Trailing commas are no longer allowed in collections',
    severity: 'warning',
    category: 'Syntax',
  },
];

const RULES_0_3_TO_1_0: RewriteRule[] = [
  {
    id: 'inline-when',
    pattern: /^(\s*)when\s+(.+)\s*$/gm,
    replacement: '$1when $2:',
    description: 'Guards require trailing colon for inline form',
    severity: 'breaking',
    category: 'Guards',
  },
  {
    id: 'type-annotations',
    pattern: /\bval\s+(\w+)\s*=/g,
    replacement: 'val $1: auto =',
    description: 'Type annotations are now required (auto-inferred with `auto`)',
    severity: 'warning',
    category: 'Types',
  },
  {
    id: 'module-imports',
    pattern: /\bimport\s+"([^"]+)"/g,
    replacement: 'import from "$1"',
    description: 'Import syntax updated to `import from "module"`',
    severity: 'info',
    category: 'Modules',
  },
  {
    id: 'return-explicit',
    pattern: /^(\s*)return\s+/gm,
    replacement: '$1yield ',
    description: 'Functions use `yield` for early returns; last expression is implicit return',
    severity: 'breaking',
    category: 'Control Flow',
  },
];

export interface BreakingChange {
  title: string;
  description: string;
  severity: 'breaking' | 'warning' | 'info';
  migration: string;
}

function getBreakingChanges(from: string, to: string): BreakingChange[] {
  const changes: BreakingChange[] = [];
  const rules = getRulesForVersions(from, to);

  for (const rule of rules) {
    changes.push({
      title: rule.description,
      description: `Category: ${rule.category}`,
      severity: rule.severity,
      migration: `Pattern: ${rule.pattern.source} => ${rule.replacement}`,
    });
  }

  return changes;
}

export function getRulesForVersions(from: string, to: string): RewriteRule[] {
  const allSteps: RewriteRule[][] = [];
  const pairs: [string, string, RewriteRule[]][] = [
    ['0.1.0', '0.2.0', RULES_0_1_TO_0_2],
    ['0.2.0', '0.3.0', RULES_0_2_TO_0_3],
    ['0.3.0', '1.0.0', RULES_0_3_TO_1_0],
  ];

  let collecting = false;
  for (const [pairFrom, pairTo, rules] of pairs) {
    if (pairFrom === from) collecting = true;
    if (collecting) allSteps.push(rules);
    if (pairTo === to) break;
  }

  return allSteps.flat();
}

export { getBreakingChanges };
