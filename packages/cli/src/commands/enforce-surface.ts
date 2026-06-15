/**
 * manifest enforce-surface
 *
 * CI-safe guard that fails when application code deviates from the
 * compiled Manifest command registry. The strictest registry-vs-app
 * check: refuses to let agents or contributors invent duplicate or
 * bypass write paths when a registered Manifest command already exists.
 *
 * Composes the existing governance detector suite (direct-writes,
 * route-drift, event-fabrication, bypass-violations) with three
 * registry-aware detectors (unregistered-command-call,
 * unregistered-entity-write, existing-command-available) and projects
 * findings into the spec-defined finding codes. Severity is downgraded
 * to `warning` for codes that the spec treats as error-only-in-strict
 * (APPROVED_BYPASS_REQUIRED, DYNAMIC_COMMAND_UNVERIFIABLE).
 *
 * Exit code:
 *   --strict + any error finding → process.exitCode = 1
 *   otherwise → 0
 *
 * The `ok` field on the result mirrors the strict failure condition:
 * ok === (errors === 0).
 */

import path from 'node:path';
import chalk from 'chalk';
import type { AuditFinding, Detector, DetectorContext } from '../audit/types.js';
import { unregisteredCommandCallDetector } from '../audit/unregistered-command-call.js';
import { directWritesDetector } from '../audit/direct-writes.js';
import { existingCommandAvailableDetector } from '../audit/existing-command-available.js';
import { routeDriftDetector } from '../audit/route-drift.js';
import { unregisteredEntityWriteDetector } from '../audit/unregistered-entity-write.js';
import { eventFabricationDetector } from '../audit/event-fabrication.js';
import { bypassViolationsDetector } from '../audit/bypass-violations.js';

export interface EnforceSurfaceOptions {
  root?: string;
  commandsRegistry?: string;
  entitiesRegistry?: string;
  bypassRegistry?: string;
  format?: 'text' | 'json';
  strict?: boolean;
  include?: string[];
  exclude?: string[];
  /** ORM client identifier the direct-write detectors match on (default: prisma). */
  writeReceiver?: string;
}

export interface EnforceSurfaceFinding {
  code: string;
  severity: 'error' | 'warning';
  file: string | null;
  line: number | null;
  column: number | null;
  entity: string | null;
  command: string | null;
  message: string;
  suggestion: string;
}

export interface EnforceSurfaceResult {
  ok: boolean;
  root: string;
  registry: {
    commandsRegistry: string | null;
    entitiesRegistry: string | null;
  };
  summary: {
    errors: number;
    warnings: number;
    byCode: Record<string, number>;
  };
  findings: EnforceSurfaceFinding[];
}

const DETECTORS: Detector[] = [
  unregisteredCommandCallDetector,
  directWritesDetector,
  existingCommandAvailableDetector,
  routeDriftDetector,
  unregisteredEntityWriteDetector,
  eventFabricationDetector,
  bypassViolationsDetector,
];

// Detector internal code → spec finding code.
// Verified against detector source on 2026-05-22:
//   direct-writes.ts:55           → DIRECT_WRITE
//   route-drift.ts:46             → ROUTE_DRIFT
//   bypass-violations.ts:80       → BYPASS_VIOLATION
//   event-fabrication.ts:44/49/54 → EVENT_FABRICATION_{PUBLISH,CTOR,EMIT_LITERAL}
const CODE_MAP: Record<string, string> = {
  DIRECT_WRITE: 'DIRECT_WRITE_BYPASS',
  ROUTE_DRIFT: 'ROUTE_SURFACE_DRIFT',
  BYPASS_VIOLATION: 'APPROVED_BYPASS_REQUIRED',
  EVENT_FABRICATION_PUBLISH: 'EVENT_FABRICATION',
  EVENT_FABRICATION_CTOR: 'EVENT_FABRICATION',
  EVENT_FABRICATION_EMIT_LITERAL: 'EVENT_FABRICATION',
};

// Spec codes whose severity is `warning` by default but `error` under --strict.
const STRICT_ESCALATE = new Set<string>([
  'APPROVED_BYPASS_REQUIRED',
  'DYNAMIC_COMMAND_UNVERIFIABLE',
]);

function defaultSuggestion(code: string): string {
  switch (code) {
    case 'UNREGISTERED_COMMAND_CALL':
      return 'Register the command in Manifest, or change the call to an existing registered command';
    case 'DIRECT_WRITE_BYPASS':
      return 'Route the write through runtime.runCommand or list the path in the bypass registry';
    case 'EXISTING_COMMAND_AVAILABLE':
      return 'Replace the duplicate path with a call to the existing registered Manifest command';
    case 'ROUTE_SURFACE_DRIFT':
      return 'Regenerate routes via `manifest emit` and use the canonical dispatcher';
    case 'UNREGISTERED_ENTITY_WRITE':
      return 'Add a Manifest entity for the model or route the write through a registered command';
    case 'EVENT_FABRICATION':
      return 'Emit events only through runtime — do not construct ManifestEvent payloads outside the runtime';
    case 'APPROVED_BYPASS_REQUIRED':
      return 'Add the path to the bypass registry with reason, owner, and reviewBy';
    case 'DYNAMIC_COMMAND_UNVERIFIABLE':
      return 'Use a static string command id, or expose a typed wrapper resolvable to a registered entity.command';
    default:
      return 'Review and align this code with the Manifest command registry';
  }
}

export async function enforceSurfaceCommand(
  options: EnforceSurfaceOptions = {}
): Promise<EnforceSurfaceResult> {
  const root = path.resolve(process.cwd(), options.root ?? '.');
  // Resolve every registry path to an absolute path up front. The
  // bypass-violations detector calls path.resolve(ctx.root, ctx.bypassRegistry)
  // internally; passing an already-absolute path is a no-op and keeps
  // registry semantics consistent regardless of whether the caller's cwd
  // matches --root.
  const resolve = (p?: string): string | undefined =>
    p ? path.resolve(process.cwd(), p) : undefined;
  const ctx: DetectorContext = {
    root,
    commandsRegistry: resolve(options.commandsRegistry),
    entitiesRegistry: resolve(options.entitiesRegistry),
    bypassRegistry: resolve(options.bypassRegistry),
    includeGlobs: options.include,
    excludeGlobs: options.exclude,
    writeReceiver: options.writeReceiver,
  };

  const raw: AuditFinding[] = [];
  for (const d of DETECTORS) {
    try {
      raw.push(...(await d.run(ctx)));
    } catch (err) {
      raw.push({
        severity: 'error',
        code: 'DETECTOR_ERROR',
        message: `Detector ${d.name} failed: ${(err as Error).message}`,
        detector: d.name,
      });
    }
  }

  const findings: EnforceSurfaceFinding[] = raw.map((f) => {
    const code = CODE_MAP[f.code] ?? f.code;
    let severity: 'error' | 'warning' = f.severity;
    if (STRICT_ESCALATE.has(code)) {
      severity = options.strict ? 'error' : 'warning';
    }
    return {
      code,
      severity,
      file: f.file ?? null,
      line: f.line ?? null,
      column: f.column ?? null,
      entity: f.entity ?? null,
      command: f.command ?? null,
      message: f.message,
      suggestion: f.suggestion ?? defaultSuggestion(code),
    };
  });

  const byCode: Record<string, number> = {};
  for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const failed = errors > 0;

  const result: EnforceSurfaceResult = {
    ok: !failed,
    root,
    registry: {
      commandsRegistry: options.commandsRegistry ?? null,
      entitiesRegistry: options.entitiesRegistry ?? null,
    },
    summary: { errors, warnings, byCode },
    findings,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(chalk.green('Surface enforced: all application code aligns with the registry.'));
    } else {
      console.log(
        chalk.bold(`enforce-surface — ${errors} errors, ${warnings} warnings`)
      );
      for (const [code, n] of Object.entries(byCode)) {
        console.log(`  ${code}: ${n}`);
      }
      for (const f of findings) {
        const tag = f.severity === 'error' ? chalk.red('error') : chalk.yellow('warning');
        const loc = f.file ? ` ${f.file}${f.line ? `:${f.line}` : ''}` : '';
        console.log(`${tag} ${f.code}${loc} — ${f.message}`);
        console.log(chalk.gray(`  ↳ ${f.suggestion}`));
      }
    }
  }

  if (options.strict && failed) process.exitCode = 1;
  return result;
}
