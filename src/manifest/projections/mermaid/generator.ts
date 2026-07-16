/**
 * Mermaid diagram projection for Manifest IR.
 *
 * Generates Mermaid diagrams from compiled IR:
 *   - ER diagrams:       Entity-relationship diagrams showing entities, properties, and relationships
 *   - State diagrams:    State machine diagrams from entity transitions
 *   - Sequence diagrams: Command execution flow showing guards, actions, and events
 *
 * Surfaces:
 *   - mermaid.er       -> ER diagram (erDiagram)
 *   - mermaid.state    -> State machine diagram (stateDiagram-v2)
 *   - mermaid.sequence -> Sequence diagram (sequenceDiagram)
 *   - mermaid.all      -> All applicable diagrams
 *
 * Diagrams are deterministic: identical IR always produces identical output.
 */

import type { IR } from '../../ir';
import { MERMAID_DESCRIPTOR_META } from './descriptor-meta.js';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionDiagnostic,
  ProjectionArtifact,
} from '../interface';

// ============================================================================
// Types
// ============================================================================

export interface MermaidProjectionOptions {
  /** Wrap output in markdown fenced code block (```mermaid ... ```) */
  markdown?: boolean;
  /** Include entity properties in ER diagrams (default: true) */
  includeProperties?: boolean;
  /** Filter to specific entity for state/sequence diagrams */
  entity?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape Mermaid string content (quotes and special chars).
 */
function escapeMermaid(str: string): string {
  return str.replace(/"/g, '#quot;');
}

/**
 * Map IR type names to Mermaid ER attribute types.
 */
function irTypeToMermaidType(typeName: string): string {
  const map: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'date',
    datetime: 'datetime',
    timestamp: 'datetime', // alias of datetime
    decimal: 'decimal',
    any: 'any',
  };
  return map[typeName] || typeName;
}

/**
 * Map IR relationship kind to Mermaid ER cardinality notation.
 */
function relationshipToCardinality(kind: string): string {
  switch (kind) {
    case 'hasMany':
      return '||--o{';
    case 'hasOne':
      return '||--||';
    case 'belongsTo':
      return '}o--||';
    case 'ref':
      return '}o--||';
    default:
      return '||--||';
  }
}

/**
 * Sanitize entity name for Mermaid (remove spaces, special chars).
 */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Format an IR expression to a readable string for diagram labels.
 */
function formatExpression(expr: {
  kind: string;
  value?: { kind: string; value?: unknown };
  name?: string;
  object?: unknown;
  property?: string;
  operator?: string;
  left?: unknown;
  right?: unknown;
  operand?: unknown;
  callee?: unknown;
  args?: unknown[];
}): string {
  switch (expr.kind) {
    case 'literal':
      if (expr.value) {
        if (expr.value.kind === 'string') return `"${expr.value.value}"`;
        return String(expr.value.value ?? 'null');
      }
      return 'null';
    case 'identifier':
      return expr.name || '?';
    case 'member':
      return `${formatExpression(expr.object as typeof expr)}.${expr.property}`;
    case 'binary':
      return `${formatExpression(expr.left as typeof expr)} ${expr.operator} ${formatExpression(expr.right as typeof expr)}`;
    case 'unary':
      return `${expr.operator}${formatExpression(expr.operand as typeof expr)}`;
    case 'call': {
      const callee = formatExpression(expr.callee as typeof expr);
      const args = (expr.args || []).map((a) => formatExpression(a as typeof expr)).join(', ');
      return `${callee}(${args})`;
    }
    default:
      return '...';
  }
}

/**
 * Wrap content in markdown fenced code block if requested.
 */
function wrapMarkdown(content: string, wrap: boolean): string {
  if (!wrap) return content;
  return '```mermaid\n' + content + '\n```';
}

// ============================================================================
// ER Diagram Generation
// ============================================================================

/**
 * Generate a Mermaid ER diagram from IR entities and relationships.
 */
function generateERDiagram(ir: IR, options: MermaidProjectionOptions): string {
  const includeProps = options.includeProperties !== false;
  const lines: string[] = ['erDiagram'];

  // Sort entities for deterministic output
  const entities = [...ir.entities].sort((a, b) => a.name.localeCompare(b.name));

  // Collect all relationship edges (deduplicated)
  const edges = new Set<string>();

  for (const entity of entities) {
    const name = sanitizeName(entity.name);

    // Entity block with properties
    if (includeProps && entity.properties.length > 0) {
      lines.push(`    ${name} {`);
      for (const prop of entity.properties) {
        const type = irTypeToMermaidType(prop.type.name);
        const comment = prop.modifiers.includes('required')
          ? 'PK'
          : prop.type.nullable
            ? 'nullable'
            : '';
        if (comment) {
          lines.push(`        ${type} ${sanitizeName(prop.name)} "${comment}"`);
        } else {
          lines.push(`        ${type} ${sanitizeName(prop.name)}`);
        }
      }
      lines.push('    }');
    } else if (!includeProps || entity.properties.length === 0) {
      // Empty entity block to ensure it appears in diagram
      lines.push(`    ${name} {`);
      lines.push('    }');
    }

    // Relationships
    for (const rel of entity.relationships) {
      const target = sanitizeName(rel.target);
      const cardinality = relationshipToCardinality(rel.kind);
      const label = `"${escapeMermaid(rel.name)}"`;
      const edgeKey = `${name}-${target}-${rel.name}`;
      if (!edges.has(edgeKey)) {
        edges.add(edgeKey);
        lines.push(`    ${name} ${cardinality} ${target} : ${label}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// State Diagram Generation
// ============================================================================

/**
 * Generate Mermaid state diagrams from IR entity transitions.
 *
 * If entity filter is specified, generates for that entity only.
 * Otherwise generates for all entities that have transitions.
 */
function generateStateDiagrams(
  ir: IR,
  options: MermaidProjectionOptions,
): { diagrams: Array<{ entity: string; code: string }>; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const diagrams: Array<{ entity: string; code: string }> = [];

  // Filter entities
  let entities = ir.entities.filter((e) => e.transitions && e.transitions.length > 0);

  if (options.entity) {
    entities = entities.filter((e) => e.name === options.entity);
    if (entities.length === 0) {
      const hasEntity = ir.entities.some((e) => e.name === options.entity);
      if (hasEntity) {
        diagnostics.push({
          severity: 'warning',
          code: 'NO_TRANSITIONS',
          message: `Entity "${options.entity}" has no state transitions defined.`,
          entity: options.entity,
        });
      } else {
        diagnostics.push({
          severity: 'error',
          code: 'ENTITY_NOT_FOUND',
          message: `Entity "${options.entity}" not found in IR.`,
        });
      }
      return { diagrams, diagnostics };
    }
  }

  if (entities.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'NO_STATE_ENTITIES',
      message: 'No entities with state transitions found in IR.',
    });
    return { diagrams, diagnostics };
  }

  // Sort for deterministic output
  entities.sort((a, b) => a.name.localeCompare(b.name));

  for (const entity of entities) {
    const transitions = entity.transitions!;
    const lines: string[] = ['stateDiagram-v2'];

    // Collect all states to determine the initial state
    const allFromStates = new Set(transitions.map((t) => t.from));
    const allToStates = new Set(transitions.flatMap((t) => t.to));
    const allStates = new Set([...allFromStates, ...allToStates]);

    // Find the default value of the status property (initial state)
    const statusProp = entity.properties.find((p) =>
      transitions.some((t) => t.property === p.name),
    );
    const defaultVal = statusProp?.defaultValue;
    const initialState = defaultVal?.kind === 'string' ? defaultVal.value : undefined;

    // Add initial state transition
    if (initialState && allStates.has(initialState)) {
      lines.push(`    [*] --> ${sanitizeName(initialState)}`);
    }

    // Find terminal states (states that have no outgoing transitions)
    const terminalStates = [...allStates].filter((s) => !allFromStates.has(s));
    for (const ts of terminalStates.sort((a, b) => a.localeCompare(b))) {
      lines.push(`    ${sanitizeName(ts)} --> [*]`);
    }

    // Add transitions (sorted for determinism)
    const sortedTransitions = [...transitions].sort((a, b) => {
      const keyA = `${a.property}.${a.from}`;
      const keyB = `${b.property}.${b.from}`;
      return keyA.localeCompare(keyB);
    });

    for (const t of sortedTransitions) {
      const from = sanitizeName(t.from);
      for (const to of [...t.to].sort((a, b) => a.localeCompare(b))) {
        lines.push(`    ${from} --> ${sanitizeName(to)}`);
      }
    }

    diagrams.push({ entity: entity.name, code: lines.join('\n') });
  }

  return { diagrams, diagnostics };
}

// ============================================================================
// Sequence Diagram Generation
// ============================================================================

/**
 * Generate Mermaid sequence diagrams from IR commands.
 *
 * Shows the execution flow: Client -> Command -> Guards -> Actions -> Events
 */
function generateSequenceDiagrams(
  ir: IR,
  options: MermaidProjectionOptions,
): {
  diagrams: Array<{ command: string; entity: string; code: string }>;
  diagnostics: ProjectionDiagnostic[];
} {
  const diagnostics: ProjectionDiagnostic[] = [];
  const diagrams: Array<{ command: string; entity: string; code: string }> = [];

  // Filter commands
  let commands = [...ir.commands].filter((c) => c.entity);

  if (options.entity) {
    commands = commands.filter((c) => c.entity === options.entity);
    if (commands.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'NO_COMMANDS',
        message: `No commands found for entity "${options.entity}".`,
        entity: options.entity,
      });
      return { diagrams, diagnostics };
    }
  }

  if (commands.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'NO_COMMANDS',
      message: 'No entity-scoped commands found in IR.',
    });
    return { diagrams, diagnostics };
  }

  // Sort for deterministic output
  commands.sort((a, b) => {
    const keyA = `${a.entity}.${a.name}`;
    const keyB = `${b.entity}.${b.name}`;
    return keyA.localeCompare(keyB);
  });

  // Build event lookup
  const eventMap = new Map(ir.events.map((e) => [e.name, e]));

  for (const cmd of commands) {
    const lines: string[] = ['sequenceDiagram'];
    const entityName = cmd.entity!;

    // Participants
    lines.push(`    participant Client`);
    lines.push(`    participant ${sanitizeName(entityName)} as ${entityName}`);
    if (cmd.emits.length > 0) {
      lines.push(`    participant EventBus`);
    }

    // Client invokes command
    const paramList =
      cmd.parameters.length > 0 ? `(${cmd.parameters.map((p) => p.name).join(', ')})` : '()';
    lines.push(`    Client->>+${sanitizeName(entityName)}: ${cmd.name}${paramList}`);

    // Policy checks
    if (cmd.policies && cmd.policies.length > 0) {
      lines.push(`    Note over ${sanitizeName(entityName)}: Policies: ${cmd.policies.join(', ')}`);
    }

    // Guard evaluation
    if (cmd.guards.length > 0) {
      lines.push(`    Note over ${sanitizeName(entityName)}: Guards (${cmd.guards.length})`);
      for (let i = 0; i < cmd.guards.length; i++) {
        const guardExpr = formatExpression(cmd.guards[i]);
        const truncated = guardExpr.length > 60 ? guardExpr.substring(0, 57) + '...' : guardExpr;
        lines.push(
          `    ${sanitizeName(entityName)}->>` +
            `${sanitizeName(entityName)}: guard[${i}]: ${escapeMermaid(truncated)}`,
        );
      }
    }

    // Actions
    if (cmd.actions.length > 0) {
      for (const action of cmd.actions) {
        const target = action.target ? `.${action.target}` : '';
        lines.push(
          `    ${sanitizeName(entityName)}->>` +
            `${sanitizeName(entityName)}: ${action.kind}${target}`,
        );
      }
    }

    // Event emissions
    if (cmd.emits.length > 0) {
      for (const eventName of cmd.emits) {
        const event = eventMap.get(eventName);
        const channel = event ? ` on ${event.channel}` : '';
        lines.push(`    ${sanitizeName(entityName)}->>EventBus: emit ${eventName}${channel}`);
      }
    }

    // Return
    if (cmd.returns) {
      const retType = cmd.returns.name + (cmd.returns.nullable ? '?' : '');
      lines.push(`    ${sanitizeName(entityName)}-->>-Client: ${retType}`);
    } else {
      lines.push(`    ${sanitizeName(entityName)}-->>-Client: void`);
    }

    diagrams.push({
      command: cmd.name,
      entity: entityName,
      code: lines.join('\n'),
    });
  }

  return { diagrams, diagnostics };
}

// ============================================================================
// Projection Implementation
// ============================================================================

/**
 * Mermaid diagram projection.
 *
 * Surfaces:
 *   - mermaid.er       -> Entity-Relationship diagram
 *   - mermaid.state    -> State machine diagram(s)
 *   - mermaid.sequence -> Sequence diagram(s)
 *   - mermaid.all      -> All applicable diagrams
 */
export class MermaidProjection implements ProjectionTarget {
  readonly name = 'mermaid';
  readonly description = 'Mermaid diagrams — ER, state machine, and sequence diagrams from IR';
  readonly surfaces = ['mermaid.er', 'mermaid.state', 'mermaid.sequence', 'mermaid.all'] as const;
  readonly descriptorMeta = MERMAID_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const options: MermaidProjectionOptions = {
      ...(request.options ?? {}),
      ...(request.entity ? { entity: request.entity } : {}),
    } as MermaidProjectionOptions;
    const wrap = options.markdown ?? false;

    switch (request.surface) {
      case 'mermaid.er':
        return this.generateER(ir, options, wrap);

      case 'mermaid.state':
        return this.generateState(ir, options, wrap);

      case 'mermaid.sequence':
        return this.generateSequence(ir, options, wrap);

      case 'mermaid.all':
        return this.generateAll(ir, options, wrap);

      default:
        return {
          artifacts: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'UNKNOWN_SURFACE',
              message: `Unknown surface: "${request.surface}". Available: ${this.surfaces.join(', ')}`,
            },
          ],
        };
    }
  }

  private generateER(ir: IR, options: MermaidProjectionOptions, wrap: boolean): ProjectionResult {
    if (ir.entities.length === 0) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'info',
            code: 'NO_ENTITIES',
            message: 'No entities found in IR.',
          },
        ],
      };
    }

    const code = generateERDiagram(ir, options);
    return {
      artifacts: [
        {
          id: 'mermaid.er',
          pathHint: 'diagrams/er-diagram.mmd',
          contentType: 'mermaid',
          code: wrapMarkdown(code, wrap),
        },
      ],
      diagnostics: [],
    };
  }

  private generateState(
    ir: IR,
    options: MermaidProjectionOptions,
    wrap: boolean,
  ): ProjectionResult {
    const { diagrams, diagnostics } = generateStateDiagrams(ir, options);

    const artifacts: ProjectionArtifact[] = diagrams.map((d) => ({
      id: `mermaid.state.${d.entity}`,
      pathHint: `diagrams/state-${d.entity}.mmd`,
      contentType: 'mermaid',
      code: wrapMarkdown(d.code, wrap),
    }));

    return { artifacts, diagnostics };
  }

  private generateSequence(
    ir: IR,
    options: MermaidProjectionOptions,
    wrap: boolean,
  ): ProjectionResult {
    const { diagrams, diagnostics } = generateSequenceDiagrams(ir, options);

    const artifacts: ProjectionArtifact[] = diagrams.map((d) => ({
      id: `mermaid.sequence.${d.entity}.${d.command}`,
      pathHint: `diagrams/sequence-${d.entity}-${d.command}.mmd`,
      contentType: 'mermaid',
      code: wrapMarkdown(d.code, wrap),
    }));

    return { artifacts, diagnostics };
  }

  private generateAll(ir: IR, options: MermaidProjectionOptions, wrap: boolean): ProjectionResult {
    const artifacts: ProjectionArtifact[] = [];
    const diagnostics: ProjectionDiagnostic[] = [];

    // ER diagram
    const er = this.generateER(ir, options, wrap);
    artifacts.push(...er.artifacts);
    diagnostics.push(...er.diagnostics);

    // State diagrams
    const state = this.generateState(ir, options, wrap);
    artifacts.push(...state.artifacts);
    diagnostics.push(...state.diagnostics);

    // Sequence diagrams
    const seq = this.generateSequence(ir, options, wrap);
    artifacts.push(...seq.artifacts);
    diagnostics.push(...seq.diagnostics);

    return { artifacts, diagnostics };
  }
}
