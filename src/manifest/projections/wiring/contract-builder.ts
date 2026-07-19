/**
 * Build a deterministic WiringContract from compiled IR.
 * Only emits metadata that is statically provable — never invents semantics.
 */

import { analyzeConstraints } from '../../constraint-analysis.js';
import type {
  IR,
  IRCommand,
  IREntity,
  IREnum,
  IRExpression,
  IRParameter,
  IRType,
} from '../../ir.js';
import { resolveRouteContract } from '../shared/route-contract.js';
import type {
  TrustedSourceKind,
  WiringCommandDescriptor,
  WiringContract,
  WiringInputConstraints,
  WiringInvalidationTarget,
  WiringLifecycleTransition,
  WiringParameterDescriptor,
  WiringProjectionOptions,
} from './types.js';
import { WIRING_CONTRACT_SCHEMA } from './types.js';

function irTypeToTs(type: IRType, enums: Map<string, IREnum>, dateAsString: boolean): string {
  if (type.name === 'array' || type.name === 'list') {
    return withNullability(arrayTs(type, enums, dateAsString), type.nullable);
  }
  if (type.name === 'map') {
    return withNullability(mapTs(type, enums, dateAsString), type.nullable);
  }
  if (dateAsString && isDateLikeType(type.name)) {
    return withNullability('string', type.nullable);
  }
  const enumUnion = enumTs(type.name, enums);
  if (enumUnion) return withNullability(enumUnion, type.nullable);
  return withNullability(primitiveTs(type.name), type.nullable);
}

function withNullability(base: string, nullable: boolean | undefined): string {
  return nullable ? `${base} | null` : base;
}

function isDateLikeType(name: string): boolean {
  return name === 'date' || name === 'datetime' || name === 'timestamp';
}

function arrayTs(type: IRType, enums: Map<string, IREnum>, dateAsString: boolean): string {
  const inner = type.generic ? irTypeToTs(type.generic, enums, dateAsString) : 'unknown';
  return inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
}

function mapTs(type: IRType, enums: Map<string, IREnum>, dateAsString: boolean): string {
  const inner = type.generic ? irTypeToTs(type.generic, enums, dateAsString) : 'unknown';
  return `Record<string, ${inner}>`;
}

function enumTs(typeName: string, enums: Map<string, IREnum>): string | undefined {
  const enumDef = enums.get(typeName);
  if (!enumDef) return undefined;
  return enumDef.values.map((v) => JSON.stringify(v.name)).join(' | ');
}

function primitiveTs(typeName: string): string {
  const map: Record<string, string> = {
    string: 'string',
    text: 'string',
    number: 'number',
    float: 'number',
    decimal: 'number',
    money: 'number',
    int: 'number',
    integer: 'number',
    bigint: 'number',
    boolean: 'boolean',
    bool: 'boolean',
    date: 'Date',
    datetime: 'Date',
    timestamp: 'Date', // alias of datetime
    time: 'string',
    duration: 'number',
    uuid: 'string',
    email: 'string',
    url: 'string',
    uri: 'string',
    any: 'unknown',
    void: 'void',
    json: 'unknown',
  };
  return map[typeName] ?? typeName;
}

function classifyTrustedSource(path: string): TrustedSourceKind {
  if (path === 'context.actorId' || path === 'context.user.id') {
    return 'actor';
  }
  if (path === 'context.tenantId') {
    return 'tenant';
  }
  if (path === 'context.orgId') {
    return 'org';
  }
  if (path === 'context.requestId') {
    return 'request';
  }
  if (path.endsWith('.id') && path.startsWith('context.')) {
    return 'routeEntityId';
  }
  if (path.startsWith('context.')) {
    return 'context';
  }
  return 'unknown';
}

function stripSelfPrefix(path: string): string {
  return path.replace(/^self\./, '').replace(/^this\./, '');
}

function constraintsForParam(
  param: IRParameter,
  command: IRCommand,
  enums: Map<string, IREnum>,
): WiringInputConstraints {
  const out: WiringInputConstraints = {};
  applyTypeDerivedConstraints(param, enums, out);
  const analysis = analyzeConstraints(command.constraints ?? []);
  const names = new Set([param.name, `self.${param.name}`, `this.${param.name}`]);
  applyAnalyzedConstraints(analysis, param.name, names, out);
  for (const c of command.constraints ?? []) {
    collectBareParamBounds(c.expression, param.name, out);
  }
  return out;
}

function applyTypeDerivedConstraints(
  param: IRParameter,
  enums: Map<string, IREnum>,
  out: WiringInputConstraints,
): void {
  const enumDef = enums.get(param.type.name);
  if (enumDef) {
    out.enumValues = enumDef.values.map((v) => v.name);
  }
  if (
    param.type.name === 'date' ||
    param.type.name === 'datetime' ||
    param.type.name === 'timestamp'
  ) {
    out.dateLike = true;
    if (param.required) out.rejectEmptyString = true;
  }
}

function pathMatchesParam(propertyPath: string, paramName: string, names: Set<string>): boolean {
  const key = stripSelfPrefix(propertyPath);
  return names.has(propertyPath) || names.has(key) || key === paramName;
}

function applyAnalyzedConstraints(
  analysis: ReturnType<typeof analyzeConstraints>,
  paramName: string,
  names: Set<string>,
  out: WiringInputConstraints,
): void {
  for (const range of analysis.numericRanges) {
    if (!pathMatchesParam(range.propertyPath, paramName, names)) continue;
    if (range.min !== undefined) out.min = range.min;
    if (range.max !== undefined) out.max = range.max;
  }
  for (const len of analysis.lengthConstraints) {
    if (!pathMatchesParam(len.propertyPath, paramName, names)) continue;
    if (len.minLength !== undefined) {
      out.minLength = len.minLength;
      if (len.minLength >= 1) out.nonEmpty = true;
    }
    if (len.maxLength !== undefined) out.maxLength = len.maxLength;
  }
  for (const pat of analysis.patternConstraints) {
    if (!pathMatchesParam(pat.propertyPath, paramName, names)) continue;
    out.pattern = pat.pattern;
  }
}

function collectBareParamBounds(
  expr: IRExpression,
  paramName: string,
  out: WiringInputConstraints,
): void {
  if (expr.kind === 'call' && expr.callee.kind === 'identifier') {
    const name = expr.callee.name;
    if (
      (name === 'between' || name === 'min' || name === 'max') &&
      expr.args[0]?.kind === 'identifier' &&
      expr.args[0].name === paramName
    ) {
      if (name === 'between' && expr.args.length >= 3) {
        const lo = literalNumber(expr.args[1]);
        const hi = literalNumber(expr.args[2]);
        if (lo !== undefined) {
          out.min = lo;
        }
        if (hi !== undefined) {
          out.max = hi;
        }
      } else if (name === 'min' && expr.args.length >= 2) {
        const lo = literalNumber(expr.args[1]);
        if (lo !== undefined) {
          out.min = lo;
        }
      } else if (name === 'max' && expr.args.length >= 2) {
        const hi = literalNumber(expr.args[1]);
        if (hi !== undefined) {
          out.max = hi;
        }
      }
    }
    if (
      name === 'length' &&
      expr.args[0]?.kind === 'identifier' &&
      expr.args[0].name === paramName
    ) {
      // handled via binary parent usually
    }
  }
  if (expr.kind === 'binary') {
    const { operator, left, right } = expr;
    if (left.kind === 'identifier' && left.name === paramName && right.kind === 'literal') {
      const n = literalNumber(right);
      if (n !== undefined) {
        if (operator === '>=') {
          out.min = n;
        }
        if (operator === '>') {
          out.min = n + 1;
        }
        if (operator === '<=') {
          out.max = n;
        }
        if (operator === '<') {
          out.max = n - 1;
        }
      }
    }
    if (
      left.kind === 'call' &&
      left.callee.kind === 'identifier' &&
      left.callee.name === 'length' &&
      left.args[0]?.kind === 'identifier' &&
      left.args[0].name === paramName
    ) {
      const n = literalNumber(right);
      if (n !== undefined) {
        if (operator === '>=') {
          out.minLength = n;
          if (n >= 1) {
            out.nonEmpty = true;
          }
        }
        if (operator === '>') {
          out.minLength = n + 1;
          out.nonEmpty = true;
        }
        if (operator === '<=') {
          out.maxLength = n;
        }
        if (operator === '<') {
          out.maxLength = n - 1;
        }
      }
    }
    collectBareParamBounds(left, paramName, out);
    collectBareParamBounds(right, paramName, out);
  }
}

function literalNumber(expr: IRExpression): number | undefined {
  if (expr.kind === 'literal' && expr.value?.kind === 'number') {
    return expr.value.value;
  }
  return;
}

function extractLifecycleTransitions(
  command: IRCommand,
  entity: IREntity | undefined,
): WiringLifecycleTransition[] {
  if (!entity?.transitions?.length) {
    return [];
  }
  const out: WiringLifecycleTransition[] = [];
  for (const action of command.actions) {
    if (action.kind !== 'mutate' || !action.target) {
      continue;
    }
    const prop = action.target;
    const rules = entity.transitions.filter((t) => t.property === prop);
    if (rules.length === 0) {
      continue;
    }
    const toVal = literalString(action.expression);
    if (toVal === undefined) {
      continue;
    }
    for (const rule of rules) {
      if (rule.to.includes(toVal)) {
        out.push({ property: prop, from: rule.from, to: toVal, proven: true });
      }
    }
  }
  return out;
}

function literalString(expr: IRExpression): string | undefined {
  if (expr.kind === 'literal' && expr.value?.kind === 'string') {
    return expr.value.value;
  }
  return;
}

function isInstanceCommand(command: IRCommand): boolean {
  if (command.name === 'create') {
    return false;
  }
  // Heuristic from IR only: create is static; others that mutate self are instance.
  // Prefer proven signal: presence of mutate/emit on entity-bound command that is not create.
  return command.entity != null && command.name !== 'create';
}

function buildInvalidation(entityName: string, camelEntity: string): WiringInvalidationTarget[] {
  return [
    {
      kind: 'entityList',
      entity: entityName,
      queryKeyHint: `queryKeys.${camelEntity}.lists()`,
      label: 'entity list',
    },
    {
      kind: 'entityDetail',
      entity: entityName,
      queryKeyHint: `queryKeys.${camelEntity}.detail(id)`,
      label: 'entity detail',
    },
  ];
}

function toLowerCamel(name: string): string {
  return name ? name[0].toLowerCase() + name.slice(1) : name;
}

function buildParameter(
  param: IRParameter,
  command: IRCommand,
  enums: Map<string, IREnum>,
  dateAsString: boolean,
): WiringParameterDescriptor {
  const ownership = param.trustedSource ? 'server' : 'client';
  const arrayElementType =
    (param.type.name === 'array' || param.type.name === 'list') && param.type.generic
      ? param.type.generic.name
      : undefined;
  return {
    name: param.name,
    tsType: irTypeToTs(param.type, enums, dateAsString),
    irTypeName: param.type.name,
    // A param the engine defaults is never a client obligation: parameter
    // processing applies defaultValue before the required check fails closed.
    required: param.required && param.defaultValue === undefined,
    nullable: param.type.nullable,
    ...(arrayElementType ? { arrayElementType } : {}),
    ownership,
    ...(param.trustedSource
      ? {
          trustedSource: param.trustedSource,
          trustedSourceKind: classifyTrustedSource(param.trustedSource),
        }
      : {}),
    constraints: constraintsForParam(param, command, enums),
    hasRuntimeGuards: (command.guards?.length ?? 0) > 0 || (command.policies?.length ?? 0) > 0,
  };
}

export function buildWiringContract(ir: IR, options?: WiringProjectionOptions): WiringContract {
  const contract = resolveRouteContract({
    appDir: options?.appDir,
    apiBasePath: options?.apiBasePath,
    dispatcherBasePath: options?.dispatcherBasePath,
    routeSegments: options?.routeSegments,
    routeCasing: options?.routeCasing,
  });
  const dateAsString = (options?.dateSerialization ?? 'iso-string') === 'iso-string';
  const enums = new Map(ir.enums.map((e) => [e.name, e]));
  const entities = new Map(ir.entities.map((e) => [e.name, e]));

  const capabilities: WiringCommandDescriptor[] = [];
  const commands = [...ir.commands].sort((a, b) => {
    const ae = a.entity ?? '';
    const be = b.entity ?? '';
    return ae.localeCompare(be) || a.name.localeCompare(b.name);
  });

  for (const command of commands) {
    const entityName = command.entity ?? '_program';
    const entity = command.entity ? entities.get(command.entity) : undefined;
    const params = command.parameters.map((p) => buildParameter(p, command, enums, dateAsString));
    const clientParameterNames = params.filter((p) => p.ownership === 'client').map((p) => p.name);
    const serverParameterNames = params.filter((p) => p.ownership === 'server').map((p) => p.name);
    const camel = toLowerCamel(entityName === '_program' ? command.name : entityName);

    capabilities.push({
      entity: entityName,
      command: command.name,
      capabilityId: `${entityName}.${command.name}`,
      route: command.entity
        ? contract.dispatcherInvocationPath(command.entity, command.name)
        : contract.dispatcherInvocationPath('_', command.name),
      instanceCommand: isInstanceCommand(command),
      parameters: params,
      clientParameterNames,
      serverParameterNames,
      returnTsType: command.returns ? irTypeToTs(command.returns, enums, dateAsString) : 'unknown',
      emits: [...(command.emits ?? [])],
      affectedEntity: entityName,
      lifecycleTransitions: extractLifecycleTransitions(command, entity),
      invalidation: entityName === '_program' ? [] : buildInvalidation(entityName, camel),
      resultStates: {
        success: true,
        errors: [
          'policy_denial',
          'guard_failure',
          'constraint_block',
          'concurrency_conflict',
          'missing_required_parameter',
          'missing_trusted_context',
          'unknown',
        ],
      },
    });
  }

  return {
    $schema: WIRING_CONTRACT_SCHEMA,
    meta: {
      compilerVersion: ir.provenance.compilerVersion,
      schemaVersion: ir.provenance.schemaVersion,
      contentHash: ir.provenance.contentHash,
      projection: 'wiring',
    },
    capabilities,
  };
}

/** Exported for bindings generator — same TS mapping. */
export function parameterTsType(param: IRParameter, ir: IR, dateAsString = true): string {
  const enums = new Map(ir.enums.map((e) => [e.name, e]));
  return irTypeToTs(param.type, enums, dateAsString);
}
