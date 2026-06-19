import {
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Range,
} from 'vscode-languageserver/node';
import type {
  CommandNode,
  EntityNode,
  ExpressionNode,
  ManifestProgram,
  ModuleNode,
  OutboxEventNode,
  ParameterNode,
  PropertyNode,
  TypeNode,
} from '@angriff36/manifest/compiler';

export interface SemanticDiagnosticSettings {
  enabled: boolean;
  projectionHints?: boolean;
}

interface FixData {
  kind: 'replaceType' | 'renameField';
  replacement: string;
  range: Range;
}

const DATE_TYPES = new Set(['date', 'datetime', 'timestamp']);
const PRECISE_NUMERIC_TYPES = new Set(['int', 'decimal', 'money']);
const TIMESTAMP_FIELD_RE = /(?:createdAt|updatedAt|deletedAt|activatedAt|suspendedAt|occurredAt|[A-Za-z0-9_]+At)$/;

export const SUPPORTED_TYPE_COMPLETIONS = [
  'string',
  'number',
  'boolean',
  'int',
  'decimal',
  'money',
  'datetime',
  'timestamp',
  'date',
  'uuid',
  'email',
  'url',
  'list',
  'array',
  'map',
  'json',
  'any',
  'void',
] as const;

export function getSemanticDiagnostics(
  program: ManifestProgram,
  source: string,
  settings: SemanticDiagnosticSettings = { enabled: true, projectionHints: true },
): Diagnostic[] {
  if (!settings.enabled) return [];

  const diagnostics: Diagnostic[] = [];
  const entities = collectEntities(program);
  const events = new Map(collectEvents(program).map((event) => [event.name, event]));

  for (const entity of entities) {
    const properties = new Map(entity.properties.map((property) => [property.name, property]));
    for (const property of entity.properties) {
      if (settings.projectionHints !== false && property.dataType.name === 'number') {
        diagnostics.push(warn(
          source,
          'manifest.bareNumberStoredProperty',
          property.name,
          `Stored property '${property.name}' uses bare number; prefer int, decimal, money, or datetime/timestamp when projecting to storage.`,
        ));
      }
    }

    for (const command of entity.commands) {
      analyzeCommandMutations(source, diagnostics, entity, properties, command);
      analyzeEmittedEvents(source, diagnostics, entity, command, events);
    }

    analyzeCreateRequiredFields(source, diagnostics, entity);
  }

  return diagnostics;
}

/**
 * Flag a `create` command that leaves a non-null date/time field unset with no
 * default — the `createdAt must not be null` class. Persisting writes null and a
 * non-null store column rejects it. Surfaced as an error (red) because this is the
 * exact shape that only ever blew up at runtime against a real DB.
 */
function analyzeCreateRequiredFields(
  source: string,
  diagnostics: Diagnostic[],
  entity: EntityNode,
): void {
  const create = entity.commands.find((command) => command.name === 'create');
  if (!create) return;

  const set = new Set(
    create.actions
      .filter((action) => action.kind === 'mutate' || action.kind === 'compute')
      .map((action) => action.target)
      .filter((target): target is string => Boolean(target)),
  );
  const hasTimestamps = (entity as { timestamps?: boolean }).timestamps === true;

  for (const property of entity.properties) {
    if (!isDateLike(property.dataType)) continue;
    if (property.dataType.nullable) continue;
    if (property.modifiers.includes('optional')) continue;
    if (property.defaultValue !== undefined) continue; // includes `= now()`
    if (property.name === 'id') continue;
    if (hasTimestamps && (property.name === 'createdAt' || property.name === 'updatedAt')) continue;
    if (set.has(property.name)) continue;

    diagnostics.push(error(
      source,
      'manifest.createMissingRequiredField',
      property.name,
      `${entity.name}.create never sets non-null field '${property.name}' (${property.dataType.name}, no default). Persisting writes null and a non-null store column rejects it. Add 'mutate ${property.name} = now()' (or a default '= now()'), or make it optional ('${property.name}: ${property.dataType.name}?').`,
    ));
  }
}

function analyzeCommandMutations(
  source: string,
  diagnostics: Diagnostic[],
  entity: EntityNode,
  properties: Map<string, PropertyNode>,
  command: CommandNode,
): void {
  const params = new Map(command.parameters.map((param) => [param.name, param]));

  for (const action of command.actions) {
    if (action.kind !== 'mutate' || !action.target) continue;
    const property = properties.get(action.target);
    const paramName = identifierName(action.expression);
    const param = paramName ? params.get(paramName) : undefined;
    if (!property || !param) continue;

    const propertyType = property.dataType.name;
    const paramType = param.dataType.name;
    if (paramType !== propertyType && isNarrowerStoredType(property.dataType, param.dataType)) {
      const replacement = preferredParamType(property.dataType);
      diagnostics.push(warn(
        source,
        'manifest.commandParamTypeMismatch',
        param.name,
        `Command parameter '${param.name}' is ${paramType}, but it mutates ${entity.name}.${property.name} (${propertyType}). Prefer ${replacement}.`,
        typeFix(source, command, param, replacement),
      ));
    }

    if (isDateLike(property.dataType) && isUnsettableByDefault(property) && param.required) {
      diagnostics.push(warn(
        source,
        'manifest.nullableDateCommandRequired',
        param.name,
        `Command parameter '${param.name}' is required, but ${entity.name}.${property.name} appears nullable/unbounded by default. Use optional/null support or separate set/clear commands.`,
        typeFix(source, command, param, preferredParamType(property.dataType)),
      ));
    }
  }
}

function analyzeEmittedEvents(
  source: string,
  diagnostics: Diagnostic[],
  entity: EntityNode,
  command: CommandNode,
  events: Map<string, OutboxEventNode>,
): void {
  for (const eventName of command.emits ?? []) {
    const event = events.get(eventName);
    if (!event || !('fields' in event.payload)) continue;

    const produced = new Set<string>([
      ...entity.properties.map((property) => property.name),
      ...command.parameters.map((param) => param.name),
      ...command.actions.map((action) => action.target).filter((target): target is string => Boolean(target)),
    ]);

    for (const field of event.payload.fields) {
      if (
        looksLikeEntitySpecificId(field.name, entity.name) &&
        !produced.has(field.name) &&
        entity.properties.some((property) => property.name === 'id')
      ) {
        diagnostics.push(warn(
          source,
          'manifest.eventPayloadNotProduced',
          field.name,
          `Event payload field '${field.name}' is not produced by ${entity.name}.${command.name}. Consider renaming it to id, computing it, or relying on the event subject id.`,
          fieldFix(source, event, field, 'id'),
        ));
      }

      if (TIMESTAMP_FIELD_RE.test(field.name) && field.dataType.name === 'number') {
        diagnostics.push(warn(
          source,
          'manifest.timestampPayloadAsNumber',
          field.name,
          `Event payload field '${field.name}' is typed as number; prefer timestamp for event time payloads.`,
          typeFix(source, event, field, 'timestamp'),
        ));
      }

      if (field.dataType.name === 'number' && !TIMESTAMP_FIELD_RE.test(field.name)) {
        diagnostics.push(warn(
          source,
          'manifest.bareNumberStoredProperty',
          field.name,
          `Payload field '${field.name}' uses bare number; prefer int, decimal, money, or timestamp when the value is projected or stored.`,
        ));
      }
    }
  }
}

function collectEntities(program: ManifestProgram): EntityNode[] {
  return [...program.entities, ...program.modules.flatMap((module) => module.entities)];
}

function collectEvents(program: ManifestProgram): OutboxEventNode[] {
  return [...program.events, ...program.modules.flatMap((module: ModuleNode) => module.events)];
}

function identifierName(expression: ExpressionNode): string | undefined {
  return expression.type === 'Identifier' ? expression.name : undefined;
}

function isNarrowerStoredType(propertyType: TypeNode, paramType: TypeNode): boolean {
  if (paramType.name !== 'number') return false;
  return PRECISE_NUMERIC_TYPES.has(propertyType.name) || DATE_TYPES.has(propertyType.name);
}

function preferredParamType(propertyType: TypeNode): string {
  if (propertyType.name === 'datetime') return 'timestamp';
  return propertyType.name;
}

function isDateLike(type: TypeNode): boolean {
  return DATE_TYPES.has(type.name);
}

function isUnsettableByDefault(property: PropertyNode): boolean {
  return !property.modifiers.includes('required') && property.defaultValue === undefined;
}

function looksLikeEntitySpecificId(fieldName: string, entityName: string): boolean {
  if (fieldName === 'id') return false;
  if (!fieldName.endsWith('Id')) return false;
  const expectedPrefix = entityName.charAt(0).toLowerCase() + entityName.slice(1);
  return fieldName.toLowerCase() !== 'tenantid' && fieldName !== `${expectedPrefix}Id`;
}

function warn(
  source: string,
  code: string,
  token: string,
  message: string,
  fix?: FixData,
): Diagnostic {
  const range = findTokenRange(source, token);
  return {
    range,
    message,
    severity: DiagnosticSeverity.Warning,
    source: 'manifest',
    code,
    data: fix ? { fix } : undefined,
  };
}

function error(
  source: string,
  code: string,
  token: string,
  message: string,
): Diagnostic {
  return {
    range: findTokenRange(source, token),
    message,
    severity: DiagnosticSeverity.Error,
    source: 'manifest',
    code,
  };
}

function typeFix(
  source: string,
  owner: CommandNode | OutboxEventNode,
  item: ParameterNode,
  replacement: string,
): FixData {
  return {
    kind: 'replaceType',
    replacement,
    range: findTypedItemTypeRange(source, owner.name, item.name, item.dataType.name),
  };
}

function fieldFix(source: string, event: OutboxEventNode, item: ParameterNode, replacement: string): FixData {
  return {
    kind: 'renameField',
    replacement,
    range: findScopedTokenRange(source, `event ${event.name}`, item.name),
  };
}

function findTypedItemTypeRange(source: string, ownerName: string, itemName: string, typeName: string): Range {
  const lines = source.split(/\r?\n/);
  let ownerSeen = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.includes(ownerName)) ownerSeen = true;
    if (!ownerSeen || !line.includes(itemName) || !line.includes(typeName)) continue;

    const itemIndex = line.indexOf(itemName);
    const colonIndex = line.indexOf(':', itemIndex);
    const typeIndex = colonIndex >= 0 ? line.indexOf(typeName, colonIndex) : -1;
    if (typeIndex >= 0) {
      return Range.create(
        Position.create(lineIndex, typeIndex),
        Position.create(lineIndex, typeIndex + typeName.length),
      );
    }
  }
  return findTokenRange(source, typeName);
}

function findScopedTokenRange(source: string, scopeStart: string, token: string): Range {
  const lines = source.split(/\r?\n/);
  let scopeSeen = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (line.includes(scopeStart)) scopeSeen = true;
    if (!scopeSeen) continue;
    const tokenIndex = line.indexOf(token);
    if (tokenIndex >= 0) {
      return Range.create(
        Position.create(lineIndex, tokenIndex),
        Position.create(lineIndex, tokenIndex + token.length),
      );
    }
  }
  return findTokenRange(source, token);
}

function findTokenRange(source: string, token: string): Range {
  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const tokenIndex = lines[lineIndex].indexOf(token);
    if (tokenIndex >= 0) {
      return Range.create(
        Position.create(lineIndex, tokenIndex),
        Position.create(lineIndex, tokenIndex + token.length),
      );
    }
  }
  return Range.create(Position.create(0, 0), Position.create(0, 1));
}
