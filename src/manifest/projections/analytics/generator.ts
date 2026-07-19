/**
 * Analytics projection for Manifest IR.
 *
 * Generates typed analytics event schemas for Segment, Amplitude, Mixpanel,
 * or Snowplow from IR command executions and entity state changes.
 *
 * Surfaces:
 *   - analytics.tracking-plan → JSON tracking plan document (all events with schemas)
 *   - analytics.events        → TypeScript typed event interfaces and a track() function
 *   - analytics.handlers      → Typed analytics.track() calls injected into command handlers
 *
 * The tracking plan follows the Segment/Tracking Plan spec format so it can
 * be consumed by any provider's schema validation tooling.
 */

import type { IR, IRCommand, IREvent, IRType } from '../../ir';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';
import type { AnalyticsProjectionOptions, AnalyticsProvider } from './types';
import { ANALYTICS_DESCRIPTOR_META } from './descriptor-meta.js';

// ============================================================================
// Surface constants
// ============================================================================

export const SURFACE_TRACKING_PLAN = 'analytics.tracking-plan' as const;
export const SURFACE_EVENTS = 'analytics.events' as const;
export const SURFACE_HANDLERS = 'analytics.handlers' as const;
export const SURFACES = [SURFACE_TRACKING_PLAN, SURFACE_EVENTS, SURFACE_HANDLERS] as const;

// ============================================================================
// Provider configuration
// ============================================================================

interface ProviderConfig {
  /** Default import path for the analytics client */
  defaultImportPath: string;
  /** Name of the track function */
  trackFn: string;
  /** Signature of the track function: (event, properties) */
  signature: 'two-arg' | 'schema-payload';
}

const PROVIDER_CONFIGS: Record<AnalyticsProvider, ProviderConfig> = {
  segment: {
    defaultImportPath: '@segment/analytics-next',
    trackFn: 'analytics.track',
    signature: 'two-arg',
  },
  amplitude: {
    defaultImportPath: '@amplitude/analytics-browser',
    trackFn: 'analytics.track',
    signature: 'two-arg',
  },
  mixpanel: {
    defaultImportPath: 'mixpanel-browser',
    trackFn: 'mixpanel.track',
    signature: 'two-arg',
  },
  snowplow: {
    defaultImportPath: '@snowplow/browser-tracker',
    trackFn: 'trackSelfDescribingEvent',
    signature: 'schema-payload',
  },
};

// ============================================================================
// Normalized options
// ============================================================================

interface NormalizedOptions {
  provider: AnalyticsProvider;
  importPath: string;
  emitHeader: boolean;
  includeEntityProperties: boolean;
  emitPerEntityHandlers: boolean;
  eventNamespace: string;
  providerConfig: ProviderConfig;
}

function normalizeOptions(options?: AnalyticsProjectionOptions): NormalizedOptions {
  const provider: AnalyticsProvider = options?.provider ?? 'segment';
  const providerConfig = PROVIDER_CONFIGS[provider];
  return {
    provider,
    importPath: options?.importPath ?? providerConfig.defaultImportPath,
    emitHeader: options?.emitHeader !== false,
    includeEntityProperties: options?.includeEntityProperties !== false,
    emitPerEntityHandlers: options?.emitPerEntityHandlers !== false,
    eventNamespace: options?.eventNamespace ?? '',
    providerConfig,
  };
}

// ============================================================================
// IR type → JSON Schema type mapping (for the tracking plan)
// ============================================================================

function irTypeToJsonSchemaType(type: IRType): string {
  switch (type.name) {
    case 'string':
    case 'text':
    case 'email':
    case 'url':
    case 'uri':
    case 'date':
    case 'datetime':
    case 'timestamp':
    case 'uuid':
      return 'string';
    case 'int':
    case 'integer':
    case 'bigint':
    case 'float':
    case 'number':
    case 'decimal':
    case 'money':
      return 'number';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'json':
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    case 'map':
      return 'object';
    case 'bytes':
      return 'string';
    default:
      return 'string';
  }
}

function irTypeToJsonSchema(type: IRType): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: irTypeToJsonSchemaType(type),
  };
  if (type.nullable) {
    result.nullable = true;
  }
  if (type.name === 'array' && type.generic) {
    result.items = irTypeToJsonSchema(type.generic);
  }
  if (type.name === 'map' && type.generic) {
    result.additionalProperties = irTypeToJsonSchema(type.generic);
  }
  if (type.name === 'date') {
    result.format = 'date';
  }
  if (type.name === 'datetime' || type.name === 'timestamp') {
    result.format = 'date-time';
  }
  if (type.name === 'uuid') {
    result.format = 'uuid';
  }
  if (type.name === 'email') {
    result.format = 'email';
  }
  if (type.name === 'url' || type.name === 'uri') {
    result.format = 'uri';
  }
  return result;
}

// ============================================================================
// IR type → TypeScript type mapping (for typed events/handlers)
// ============================================================================

function irTypeToTs(type: IRType): string {
  switch (type.name) {
    case 'string':
    case 'text':
    case 'email':
    case 'url':
    case 'uri':
    case 'uuid':
      return 'string';
    case 'int':
    case 'integer':
    case 'bigint':
    case 'float':
    case 'number':
    case 'decimal':
    case 'money':
      return 'number';
    case 'boolean':
    case 'bool':
      return 'boolean';
    case 'date':
    case 'datetime':
    case 'timestamp':
      return 'string';
    case 'json':
    case 'object':
      return 'Record<string, unknown>';
    case 'array':
      if (type.generic) {
        return `${irTypeToTs(type.generic)}[]`;
      }
      return 'unknown[]';
    case 'map':
      if (type.generic) {
        return `Record<string, ${irTypeToTs(type.generic)}>`;
      }
      return 'Record<string, unknown>';
    case 'bytes':
      return 'string';
    case 'any':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function irTypeToTsOptional(type: IRType, required: boolean): string {
  const base = irTypeToTs(type);
  if (!required || type.nullable) {
    return `${base} | null`;
  }
  return base;
}

// ============================================================================
// Event derivation from IR
// ============================================================================

/** A derived analytics event with its properties. */
interface DerivedEvent {
  /** Event name (namespaced) */
  name: string;
  /** Event description */
  description: string;
  /** Source entity name */
  entity: string;
  /** Source command name (or undefined if entity-derived) */
  command?: string;
  /** Event channel (for IR events) */
  channel?: string;
  /** Event properties (name → JSON schema) */
  properties: Array<{
    name: string;
    type: IRType;
    required: boolean;
    description?: string;
  }>;
}

/**
 * Derive all analytics events from the IR.
 * Sources:
 *  1. Command emits → one event per emit per command
 *  2. IREvent declarations
 *  3. Entity property changes (if includeEntityProperties)
 */
function deriveEvents(
  ir: IR,
  opts: NormalizedOptions,
  _diagnostics: ProjectionDiagnostic[],
): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const seen = new Set<string>();

  // Build lookup: event name → IREvent (for payload enrichment)
  const eventDeclByName = new Map<string, IREvent>();
  for (const evt of ir.events) {
    eventDeclByName.set(evt.name, evt);
  }

  // Derive events from commands (command execution → event)
  for (const cmd of ir.commands) {
    if (!cmd.entity) continue;

    for (const emitName of cmd.emits) {
      const eventDecl = eventDeclByName.get(emitName);
      const properties: DerivedEvent['properties'] = [];

      if (eventDecl) {
        // Use declared event payload
        if (Array.isArray(eventDecl.payload)) {
          for (const field of eventDecl.payload) {
            properties.push({
              name: field.name,
              type: field.type,
              required: field.required ?? true,
            });
          }
        }
      } else {
        // Synthesize from command parameters
        for (const param of cmd.parameters) {
          properties.push({
            name: param.name,
            type: param.type,
            required: param.required,
          });
        }
        // Add entity id reference
        properties.push({
          name: 'entityId',
          type: { name: 'string', nullable: false },
          required: true,
          description: 'ID of the affected entity instance',
        });
      }

      const eventName = namespaceEvent(emitName, opts.eventNamespace);
      if (seen.has(eventName)) continue;
      seen.add(eventName);

      events.push({
        name: eventName,
        description: `Emitted when command '${cmd.name}' executes on ${cmd.entity}`,
        entity: cmd.entity,
        command: cmd.name,
        channel: eventDecl?.channel,
        properties,
      });
    }
  }

  // Include standalone IREvent declarations that weren't already captured
  for (const evt of ir.events) {
    const eventName = namespaceEvent(evt.name, opts.eventNamespace);
    if (seen.has(eventName)) continue;
    seen.add(eventName);

    const properties: DerivedEvent['properties'] = [];
    if (Array.isArray(evt.payload)) {
      for (const field of evt.payload) {
        properties.push({
          name: field.name,
          type: field.type,
          required: field.required ?? true,
        });
      }
    }

    events.push({
      name: eventName,
      description: `Standalone event '${evt.name}' on channel '${evt.channel}'`,
      entity: '',
      channel: evt.channel,
      properties,
    });
  }

  // Derive entity property events (state change tracking)
  if (opts.includeEntityProperties) {
    for (const entity of ir.entities) {
      for (const prop of entity.properties) {
        const eventName = namespaceEvent(
          `${entity.name} ${prop.name} Changed`,
          opts.eventNamespace,
        );
        if (seen.has(eventName)) continue;
        seen.add(eventName);

        events.push({
          name: eventName,
          description: `Entity property '${prop.name}' changed on ${entity.name}`,
          entity: entity.name,
          properties: [
            {
              name: 'entityId',
              type: { name: 'string', nullable: false },
              required: true,
            },
            {
              name: 'oldValue',
              type: prop.type,
              required: false,
            },
            {
              name: 'newValue',
              type: prop.type,
              required: true,
            },
          ],
        });
      }
    }
  }

  // Sort events deterministically
  events.sort((a, b) => a.name.localeCompare(b.name));
  return events;
}

function namespaceEvent(name: string, namespace: string): string {
  if (!namespace) return name;
  return `${namespace} ${name}`;
}

// ============================================================================
// Property name helpers
// ============================================================================

function toPascalCase(name: string): string {
  return name
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ============================================================================
// Tracking plan surface (JSON document)
// ============================================================================

function generateTrackingPlan(
  ir: IR,
  opts: NormalizedOptions,
  _diagnostics: ProjectionDiagnostic[],
): string {
  const events = deriveEvents(ir, opts, _diagnostics);

  const plan = {
    $schema: 'https://json.schemastore.org/tracking-plan.json',
    provider: opts.provider,
    namespace: opts.eventNamespace || undefined,
    generatedAt: new Date().toISOString(),
    source: {
      irVersion: ir.version,
      contentHash: ir.provenance.contentHash,
    },
    events: events.map((evt) => ({
      name: evt.name,
      description: evt.description,
      entity: evt.entity,
      command: evt.command,
      channel: evt.channel,
      properties: Object.fromEntries(
        evt.properties.map((p) => [
          p.name,
          {
            ...irTypeToJsonSchema(p.type),
            required: p.required,
            description: p.description,
          },
        ]),
      ),
    })),
  };

  return JSON.stringify(plan, null, 2);
}

// ============================================================================
// Typed events surface (TypeScript)
// ============================================================================

function generateTypedEvents(
  ir: IR,
  opts: NormalizedOptions,
  _diagnostics: ProjectionDiagnostic[],
): string {
  const events = deriveEvents(ir, opts, _diagnostics);
  const lines: string[] = [];

  if (opts.emitHeader) {
    lines.push('/**');
    lines.push(' * Auto-generated by Manifest Analytics projection');
    lines.push(` * Generated at: ${new Date().toISOString()}`);
    lines.push(' *');
    lines.push(` * Provider: ${opts.provider}`);
    lines.push(' * DO NOT EDIT — regenerate with: manifest generate --surface analytics.events');
    lines.push(' */');
    lines.push('');
  }

  // Event property type interfaces
  lines.push('// ============================================================================');
  lines.push('// Event property types');
  lines.push('// ============================================================================');
  lines.push('');

  for (const evt of events) {
    const ifaceName = `${toPascalCase(evt.name)}Properties`;
    if (evt.properties.length === 0) {
      lines.push(`export type ${ifaceName} = Record<string, never>;`);
    } else {
      lines.push(`export interface ${ifaceName} {`);
      for (const prop of evt.properties) {
        const tsType = irTypeToTsOptional(prop.type, prop.required);
        const optional = prop.required ? '' : '?';
        lines.push(`  ${prop.name}${optional}: ${tsType};`);
      }
      lines.push('}');
    }
    lines.push('');
  }

  // Event name constants
  lines.push('// ============================================================================');
  lines.push('// Event name constants');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export const AnalyticsEvents = {');
  for (const evt of events) {
    const constName = toCamelCase(evt.name);
    lines.push(`  ${constName}: ${JSON.stringify(evt.name)},`);
  }
  lines.push('} as const;');
  lines.push('');

  // Full event map (name → properties type)
  lines.push('// ============================================================================');
  lines.push('// Event → properties type map');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export interface AnalyticsEventMap {');
  for (const evt of events) {
    const ifaceName = `${toPascalCase(evt.name)}Properties`;
    lines.push(`  ${JSON.stringify(evt.name)}: ${ifaceName};`);
  }
  lines.push('}');
  lines.push('');

  // Typed track function
  lines.push('// ============================================================================');
  lines.push('// Typed track function');
  lines.push('// ============================================================================');
  lines.push('');

  if (opts.providerConfig.signature === 'two-arg') {
    lines.push('/**');
    lines.push(' * Type-safe wrapper around the analytics track function.');
    lines.push(' * Use AnalyticsEvents constants to avoid typos in event names.');
    lines.push(' */');
    lines.push('export function track<K extends keyof AnalyticsEventMap>(');
    lines.push('  event: K,');
    lines.push('  properties: AnalyticsEventMap[K],');
    lines.push('): void {');
    lines.push(`  ${opts.providerConfig.trackFn}(event, properties as Record<string, unknown>);`);
    lines.push('}');
  } else {
    // snowplow uses self-describing event schema
    lines.push('/**');
    lines.push(' * Type-safe wrapper around Snowplow trackSelfDescribingEvent.');
    lines.push(' * Use AnalyticsEvents constants to avoid typos in event names.');
    lines.push(' */');
    lines.push('export function track<K extends keyof AnalyticsEventMap>(');
    lines.push('  event: K,');
    lines.push('  properties: AnalyticsEventMap[K],');
    lines.push('): void {');
    lines.push('  const schema = {');
    lines.push('    vendor: "com.manifest",');
    lines.push('    name: event,');
    lines.push('    format: "jsonschema",');
    lines.push('    version: "1-0-0",');
    lines.push('  };');
    lines.push(`  ${opts.providerConfig.trackFn}(schema, properties as Record<string, unknown>);`);
    lines.push('}');
  }

  lines.push('');
  return lines.join('\n');
}

// ============================================================================
// Typed handlers surface (analytics.track() calls in command handlers)
// ============================================================================

/** Result of generating the handlers surface. */
interface HandlersResult {
  artifacts: ProjectionArtifact[];
  diagnostics: ProjectionDiagnostic[];
}

function generateHandlers(
  ir: IR,
  opts: NormalizedOptions,
  diagnostics: ProjectionDiagnostic[],
): HandlersResult {
  const events = deriveEvents(ir, opts, diagnostics);
  const artifacts: ProjectionArtifact[] = [];

  // Build lookup: command → events it emits
  const commandEvents = new Map<string, DerivedEvent[]>();
  for (const evt of events) {
    if (evt.command && evt.entity) {
      const key = `${evt.entity}.${evt.command}`;
      const existing = commandEvents.get(key) ?? [];
      existing.push(evt);
      commandEvents.set(key, existing);
    }
  }

  // Group commands by entity
  const commandsByEntity = new Map<string, IRCommand[]>();
  for (const cmd of ir.commands) {
    if (!cmd.entity) continue;
    const existing = commandsByEntity.get(cmd.entity) ?? [];
    existing.push(cmd);
    commandsByEntity.set(cmd.entity, existing);
  }

  if (opts.emitPerEntityHandlers) {
    // One file per entity
    for (const entity of ir.entities) {
      const cmds = commandsByEntity.get(entity.name) ?? [];
      if (cmds.length === 0) continue;

      const code = generateEntityHandlerFile(entity.name, cmds, commandEvents, opts);

      artifacts.push({
        id: `analytics.handlers.${entity.name}`,
        pathHint: `analytics/handlers/${entityNameLower(entity.name)}.ts`,
        contentType: 'typescript',
        code,
      });
    }
  } else {
    // Single file with all handlers
    const code = generateAllHandlersFile(ir, commandEvents, opts);
    artifacts.push({
      id: 'analytics.handlers',
      pathHint: 'analytics/handlers.ts',
      contentType: 'typescript',
      code,
    });
  }

  return { artifacts, diagnostics };
}

function generateEntityHandlerFile(
  entityName: string,
  commands: IRCommand[],
  commandEvents: Map<string, DerivedEvent[]>,
  opts: NormalizedOptions,
): string {
  const lines: string[] = [];

  if (opts.emitHeader) {
    lines.push('/**');
    lines.push(' * Auto-generated by Manifest Analytics projection');
    lines.push(` * Generated at: ${new Date().toISOString()}`);
    lines.push(' *');
    lines.push(` * Provider: ${opts.provider}`);
    lines.push(` * Entity: ${entityName}`);
    lines.push(' * DO NOT EDIT — regenerate with: manifest generate --surface analytics.handlers');
    lines.push(' */');
    lines.push('');
  }

  lines.push(`import { track, AnalyticsEvents } from './analytics.events';`);
  lines.push(`import type { ${entityName}AnalyticsContext } from './analytics.types';`);
  lines.push('');

  for (const cmd of commands) {
    const key = `${entityName}.${cmd.name}`;
    const events = commandEvents.get(key) ?? [];

    lines.push(`/**`);
    lines.push(` * Analytics tracking for command '${cmd.name}' on ${entityName}.`);
    lines.push(` * Call this AFTER successful command execution.`);
    if (events.length > 0) {
      lines.push(` * Emits: ${events.map((e) => e.name).join(', ')}`);
    }
    lines.push(` */`);
    lines.push(`export function track${toPascalCase(cmd.name)}(`);
    lines.push(`  entityId: string,`);
    lines.push(`  params: Record<string, unknown>,`);
    lines.push(`  context: ${entityName}AnalyticsContext = {},`);
    lines.push(`): void {`);

    if (events.length === 0) {
      lines.push('  // No events declared for this command');
    } else {
      for (const evt of events) {
        lines.push(`  track(`);
        lines.push(`    AnalyticsEvents.${toCamelCase(evt.name)},`);
        lines.push(`    {`);

        // Entity id is always included
        const includedProps = new Set<string>();
        for (const prop of evt.properties) {
          if (prop.name === 'entityId' || prop.name === 'id') {
            lines.push(`      ${prop.name},`);
            includedProps.add(prop.name);
          }
        }

        // Add command params that match event properties
        for (const prop of evt.properties) {
          if (includedProps.has(prop.name)) continue;
          if (prop.name === 'entityId' || prop.name === 'id') continue;
          // Check if this property name maps to a command param
          const paramMatch = cmd.parameters.find((p) => p.name === prop.name);
          if (paramMatch) {
            lines.push(`      ${prop.name}: params[${JSON.stringify(prop.name)}] as never,`);
          } else {
            lines.push(`      ${prop.name}: undefined as never,`);
          }
        }

        lines.push(`    },`);
        lines.push(`  );`);
      }
    }

    lines.push(`}`);
    lines.push('');
  }

  return lines.join('\n');
}

function generateAllHandlersFile(
  ir: IR,
  commandEvents: Map<string, DerivedEvent[]>,
  opts: NormalizedOptions,
): string {
  const lines: string[] = [];

  if (opts.emitHeader) {
    lines.push('/**');
    lines.push(' * Auto-generated by Manifest Analytics projection');
    lines.push(` * Generated at: ${new Date().toISOString()}`);
    lines.push(' *');
    lines.push(` * Provider: ${opts.provider}`);
    lines.push(' * DO NOT EDIT — regenerate with: manifest generate --surface analytics.handlers');
    lines.push(' */');
    lines.push('');
  }

  lines.push(`import { track, AnalyticsEvents } from './analytics.events';`);
  lines.push('');

  // Group by entity
  const commandsByEntity = new Map<string, IRCommand[]>();
  for (const cmd of ir.commands) {
    if (!cmd.entity) continue;
    const existing = commandsByEntity.get(cmd.entity) ?? [];
    existing.push(cmd);
    commandsByEntity.set(cmd.entity, existing);
  }

  for (const [entityName, commands] of commandsByEntity) {
    lines.push(`// ${entityName} commands`);
    lines.push('');

    for (const cmd of commands) {
      const key = `${entityName}.${cmd.name}`;
      const events = commandEvents.get(key) ?? [];

      lines.push(`export function track${toPascalCase(cmd.name)}(`);
      lines.push(`  entityId: string,`);
      lines.push(`  params: Record<string, unknown> = {},`);
      lines.push(`): void {`);

      if (events.length === 0) {
        lines.push('  // No events declared for this command');
      } else {
        for (const evt of events) {
          lines.push(`  track(`);
          lines.push(`    AnalyticsEvents.${toCamelCase(evt.name)},`);
          lines.push(`    { entityId },`);
          lines.push(`  );`);
        }
      }

      lines.push(`}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function entityNameLower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// ============================================================================
// Main projection class
// ============================================================================

export class AnalyticsProjection implements ProjectionTarget {
  readonly name = 'analytics';
  readonly description =
    'Typed analytics event schemas and track() calls for Segment, Amplitude, Mixpanel, or Snowplow';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = ANALYTICS_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options as AnalyticsProjectionOptions | undefined);

    switch (request.surface) {
      case SURFACE_TRACKING_PLAN:
        return {
          artifacts: [
            {
              id: 'analytics.tracking-plan',
              pathHint: 'analytics/tracking-plan.json',
              contentType: 'json',
              code: generateTrackingPlan(ir, opts, diagnostics),
            },
          ],
          diagnostics,
        };

      case SURFACE_EVENTS:
        return {
          artifacts: [
            {
              id: 'analytics.events',
              pathHint: 'analytics/analytics.events.ts',
              contentType: 'typescript',
              code: generateTypedEvents(ir, opts, diagnostics),
            },
          ],
          diagnostics,
        };

      case SURFACE_HANDLERS: {
        const result = generateHandlers(ir, opts, diagnostics);
        return { artifacts: result.artifacts, diagnostics: result.diagnostics };
      }

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'ANALYTICS_UNKNOWN_SURFACE',
              message: `Unknown surface "${request.surface}". Expected one of: ${this.surfaces.join(', ')}`,
            },
          ],
        };
    }
  }
}
