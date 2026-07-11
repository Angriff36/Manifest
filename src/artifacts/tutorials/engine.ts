/**
 * Tutorial engine - validates user code against tutorial step requirements.
 * Compiles the source to IR and checks structure to determine step completion.
 */
import type {
  Tutorial,
  TutorialStep,
  StepValidation,
  ValidationResult,
  CheckResult,
} from './types';
import { compileToIR } from '../../manifest/ir-compiler';
import type { IR } from '../../manifest/ir';

interface CompileContext {
  success: boolean;
  source: string;
  ir: IR | null;
  compileError: string | undefined;
}

/** Compile source and cache result for the validation pass */
async function compileSource(source: string): Promise<CompileContext> {
  try {
    const { ir, diagnostics } = await compileToIR(source, { useCache: false });
    const errors = (diagnostics || []).filter((d) => d.severity === 'error');
    if (errors.length > 0 || !ir) {
      return {
        success: false,
        source,
        ir,
        compileError: errors.map((e) => e.message).join('; ') || 'Compilation failed',
      };
    }
    return { success: true, source, ir, compileError: undefined };
  } catch (e) {
    return {
      success: false,
      source,
      ir: null,
      compileError: e instanceof Error ? e.message : 'Unknown compilation error',
    };
  }
}

/** Validate a single step against the user's source code (async) */
export async function validateStep(step: TutorialStep, source: string): Promise<ValidationResult> {
  const ctx = await compileSource(source);
  const checks: CheckResult[] = [];

  for (const rule of step.validation) {
    const check = evaluateRule(rule, ctx);
    checks.push(check);
  }

  const passed = checks.every((c) => c.passed);
  const passedCount = checks.filter((c) => c.passed).length;
  const message = passed
    ? 'Step complete!'
    : ctx.compileError
      ? `Compilation error: ${ctx.compileError}`
      : `${passedCount}/${checks.length} checks passing`;

  return { stepId: step.id, passed, checks, message, compileError: ctx.compileError };
}

/** Evaluate a single validation rule */
function evaluateRule(rule: StepValidation, ctx: CompileContext): CheckResult {
  switch (rule.type) {
    case 'compiles':
      return {
        description: 'Code compiles without errors',
        passed: ctx.success,
        detail: ctx.compileError || undefined,
      };

    case 'source-contains':
      return {
        description: `Code contains "${rule.text}"`,
        passed: ctx.source.includes(rule.text),
      };

    case 'source-matches':
      try {
        const re = new RegExp(rule.pattern);
        return {
          description: `Code matches pattern`,
          passed: re.test(ctx.source),
        };
      } catch {
        return { description: 'Pattern validation', passed: false, detail: 'Invalid pattern' };
      }

    case 'has-entity': {
      if (!ctx.success || !ctx.ir) {
        return {
          description: `Entity "${rule.name}" defined`,
          passed: false,
          detail: ctx.compileError,
        };
      }
      const entities = ctx.ir.entities || [];
      const found = entities.some((e) => e.name === rule.name);
      return {
        description: `Entity "${rule.name}" is defined`,
        passed: found,
      };
    }

    case 'has-property': {
      if (!ctx.success || !ctx.ir) {
        return {
          description: `Property "${rule.entity}.${rule.property}"`,
          passed: false,
          detail: ctx.compileError,
        };
      }
      const entity = (ctx.ir.entities || []).find((e) => e.name === rule.entity);
      if (!entity) {
        return { description: `Entity "${rule.entity}" exists`, passed: false };
      }
      const props = entity.properties || [];
      const found = props.some(
        (p) => p.name === rule.property && (!rule.typeName || p.type?.name === rule.typeName),
      );
      return {
        description: `Property "${rule.property}"${rule.typeName ? ` of type ${rule.typeName}` : ''} on "${rule.entity}"`,
        passed: found,
      };
    }

    case 'has-command': {
      if (!ctx.success || !ctx.ir) {
        return { description: `Command "${rule.name}"`, passed: false, detail: ctx.compileError };
      }
      const commands = ctx.ir.commands || [];
      const found = commands.some((c) => c.name === rule.name);
      return {
        description: `Command "${rule.name}" is defined`,
        passed: found,
      };
    }

    case 'has-guard': {
      if (!ctx.success || !ctx.ir) {
        return {
          description: `Guard on "${rule.command}"`,
          passed: false,
          detail: ctx.compileError,
        };
      }
      const commands = ctx.ir.commands || [];
      const cmd = commands.find((c) => c.name === rule.command);
      if (!cmd) {
        return { description: `Command "${rule.command}" exists`, passed: false };
      }
      const guards = cmd.guards || [];
      return {
        description: `Command "${rule.command}" has a guard`,
        passed: guards.length > 0,
      };
    }

    case 'has-computed': {
      if (!ctx.success || !ctx.ir) {
        return { description: `Computed property`, passed: false, detail: ctx.compileError };
      }
      const entity = (ctx.ir.entities || []).find((e) => e.name === rule.entity);
      if (!entity) {
        return { description: `Entity "${rule.entity}" exists`, passed: false };
      }
      const computed = entity.computedProperties || [];
      const found = computed.some((c) => c.name === rule.name);
      return {
        description: `Computed property "${rule.name}" on "${rule.entity}"`,
        passed: found,
      };
    }

    case 'has-policy': {
      if (!ctx.success || !ctx.ir) {
        return { description: `Policy "${rule.name}"`, passed: false, detail: ctx.compileError };
      }
      const policies = ctx.ir.policies || [];
      const found = policies.some(
        (p) => p.name === rule.name && (!rule.action || p.action === rule.action),
      );
      return {
        description: `Policy "${rule.name}"${rule.action ? ` (${rule.action})` : ''}`,
        passed: found,
      };
    }

    case 'ir-has': {
      if (!ctx.success || !ctx.ir) {
        return { description: `IR has ${rule.path}`, passed: false, detail: ctx.compileError };
      }
      const value = getPath(ctx.ir, rule.path);
      const matches = rule.value === undefined ? value !== undefined : value === rule.value;
      return {
        description: `IR.${rule.path} ${rule.value !== undefined ? `= ${JSON.stringify(rule.value)}` : 'is set'}`,
        passed: matches,
      };
    }

    default:
      return { description: 'Unknown check', passed: false };
  }
}

/** Get a value at a dotted path in an object */
function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Get the next incomplete step in a tutorial */
export function getNextStep(tutorial: Tutorial, completedStepIds: string[]): TutorialStep | null {
  for (const step of tutorial.steps) {
    if (!completedStepIds.includes(step.id)) {
      return step;
    }
  }
  return null;
}

/** Get tutorial completion percentage */
export function getProgressPercent(tutorial: Tutorial, completedStepIds: string[]): number {
  if (tutorial.steps.length === 0) return 0;
  const completed = tutorial.steps.filter((s) => completedStepIds.includes(s.id)).length;
  return Math.round((completed / tutorial.steps.length) * 100);
}
