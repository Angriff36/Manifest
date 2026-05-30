/**
 * Unit tests for Mermaid diagram projection.
 *
 * Tests ER diagrams, state machine diagrams, and sequence diagrams
 * against representative IR fixtures.
 */

import { describe, it, expect } from 'vitest';
import { MermaidProjection } from './generator';
import type { IR, IREntity, IRCommand, IREvent } from '../../ir';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIR(overrides: Partial<IR> = {}): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'test-hash',
      compilerVersion: '1.0.0',
      schemaVersion: '1.0',
      compiledAt: '2025-01-01T00:00:00.000Z',
    },
    modules: [],
    values: [],
    entities: [],
    enums: [],
    stores: [],
    events: [],
    commands: [],
    policies: [],
    ...overrides,
  };
}

function makeEntity(overrides: Partial<IREntity> = {}): IREntity {
  return {
    name: 'TestEntity',
    properties: [],
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Projection instance
// ---------------------------------------------------------------------------

const projection = new MermaidProjection();

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('MermaidProjection', () => {
  it('has correct metadata', () => {
    expect(projection.name).toBe('mermaid');
    expect(projection.surfaces).toContain('mermaid.er');
    expect(projection.surfaces).toContain('mermaid.state');
    expect(projection.surfaces).toContain('mermaid.sequence');
    expect(projection.surfaces).toContain('mermaid.all');
  });

  it('rejects unknown surfaces', () => {
    const ir = makeIR();
    const result = projection.generate(ir, { surface: 'mermaid.unknown' });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].code).toBe('UNKNOWN_SURFACE');
  });

  // ─── ER Diagrams ────────────────────────────────────────────────────

  describe('ER diagrams (mermaid.er)', () => {
    it('generates an ER diagram with entities and properties', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'User',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'name', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'email', type: { name: 'string', nullable: true }, modifiers: [] },
            ],
          }),
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.er' });
      expect(result.artifacts).toHaveLength(1);
      expect(result.diagnostics).toHaveLength(0);

      const code = result.artifacts[0].code;
      expect(code).toContain('erDiagram');
      expect(code).toContain('User {');
      expect(code).toContain('string id "PK"');
      expect(code).toContain('string name "PK"');
      expect(code).toContain('string email "nullable"');
    });

    it('generates relationship cardinality notation', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Author',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            relationships: [
              { name: 'books', kind: 'hasMany', target: 'Book' },
            ],
          }),
          makeEntity({
            name: 'Book',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
            relationships: [
              { name: 'author', kind: 'belongsTo', target: 'Author' },
            ],
          }),
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.er' });
      const code = result.artifacts[0].code;

      // hasMany: ||--o{
      expect(code).toContain('Author ||--o{ Book : "books"');
      // belongsTo: }o--||
      expect(code).toContain('Book }o--|| Author : "author"');
    });

    it('returns info diagnostic for empty IR', () => {
      const ir = makeIR();
      const result = projection.generate(ir, { surface: 'mermaid.er' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('NO_ENTITIES');
    });

    it('produces deterministic output', () => {
      const ir = makeIR({
        entities: [
          makeEntity({ name: 'Zebra', properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: [] }] }),
          makeEntity({ name: 'Apple', properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: [] }] }),
        ],
      });

      const r1 = projection.generate(ir, { surface: 'mermaid.er' });
      const r2 = projection.generate(ir, { surface: 'mermaid.er' });
      expect(r1.artifacts[0].code).toBe(r2.artifacts[0].code);

      // Alphabetical ordering: Apple before Zebra
      const code = r1.artifacts[0].code;
      const appleIdx = code.indexOf('Apple');
      const zebraIdx = code.indexOf('Zebra');
      expect(appleIdx).toBeLessThan(zebraIdx);
    });

    it('supports markdown wrapping', () => {
      const ir = makeIR({
        entities: [
          makeEntity({ name: 'Foo', properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: [] }] }),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'mermaid.er',
        options: { markdown: true },
      });
      const code = result.artifacts[0].code;
      expect(code).toMatch(/^```mermaid\n/);
      expect(code).toMatch(/\n```$/);
    });

    it('can exclude properties', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Foo',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
            ],
          }),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'mermaid.er',
        options: { includeProperties: false },
      });
      const code = result.artifacts[0].code;
      expect(code).toContain('Foo {');
      expect(code).not.toContain('string id');
    });
  });

  // ─── State Diagrams ─────────────────────────────────────────────────

  describe('State diagrams (mermaid.state)', () => {
    it('generates state diagram from entity transitions', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Document',
            properties: [
              { name: 'status', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'draft' } },
            ],
            transitions: [
              { property: 'status', from: 'draft', to: ['review'] },
              { property: 'status', from: 'review', to: ['published', 'draft'] },
              { property: 'status', from: 'published', to: ['archived'] },
            ],
          }),
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.state' });
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain('stateDiagram-v2');
      expect(code).toContain('[*] --> draft'); // initial state from default
      expect(code).toContain('draft --> review');
      expect(code).toContain('review --> draft');
      expect(code).toContain('review --> published');
      expect(code).toContain('published --> archived');
      expect(code).toContain('archived --> [*]'); // terminal state
    });

    it('returns info diagnostic when no transitions exist', () => {
      const ir = makeIR({
        entities: [
          makeEntity({ name: 'NoStates' }),
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.state' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('NO_STATE_ENTITIES');
    });

    it('filters by entity name', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Doc',
            properties: [
              { name: 'status', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'open' } },
            ],
            transitions: [
              { property: 'status', from: 'open', to: ['closed'] },
            ],
          }),
          makeEntity({
            name: 'Ticket',
            properties: [
              { name: 'state', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'new' } },
            ],
            transitions: [
              { property: 'state', from: 'new', to: ['active'] },
            ],
          }),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'mermaid.state',
        entity: 'Doc',
      });

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('mermaid.state.Doc');
    });

    it('warns when filtered entity has no transitions', () => {
      const ir = makeIR({
        entities: [
          makeEntity({ name: 'Plain' }),
        ],
      });

      const result = projection.generate(ir, {
        surface: 'mermaid.state',
        entity: 'Plain',
      });
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('NO_TRANSITIONS');
    });

    it('errors when filtered entity does not exist', () => {
      const ir = makeIR();

      const result = projection.generate(ir, {
        surface: 'mermaid.state',
        entity: 'NonExistent',
      });
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].severity).toBe('error');
      expect(result.diagnostics[0].code).toBe('ENTITY_NOT_FOUND');
    });
  });

  // ─── Sequence Diagrams ──────────────────────────────────────────────

  describe('Sequence diagrams (mermaid.sequence)', () => {
    it('generates sequence diagram from commands', () => {
      const commands: IRCommand[] = [
        {
          name: 'submit',
          entity: 'Document',
          parameters: [
            { name: 'notes', type: { name: 'string', nullable: false }, required: false },
          ],
          guards: [
            {
              kind: 'binary',
              operator: '==',
              left: { kind: 'member', object: { kind: 'identifier', name: 'self' }, property: 'status' },
              right: { kind: 'literal', value: { kind: 'string', value: 'draft' } },
            },
          ],
          actions: [
            { kind: 'mutate', target: 'status', expression: { kind: 'literal', value: { kind: 'string', value: 'review' } } },
          ],
          emits: ['DocumentSubmitted'],
        },
      ];

      const events: IREvent[] = [
        {
          name: 'DocumentSubmitted',
          channel: 'documents.submitted',
          payload: [
            { name: 'id', type: { name: 'string', nullable: false }, required: true },
          ],
        },
      ];

      const ir = makeIR({
        entities: [makeEntity({ name: 'Document', commands: ['submit'] })],
        commands,
        events,
      });

      const result = projection.generate(ir, { surface: 'mermaid.sequence' });
      expect(result.artifacts).toHaveLength(1);

      const code = result.artifacts[0].code;
      expect(code).toContain('sequenceDiagram');
      expect(code).toContain('participant Client');
      expect(code).toContain('participant Document');
      expect(code).toContain('participant EventBus');
      expect(code).toContain('Client->>+Document: submit(notes)');
      expect(code).toContain('guard[0]');
      expect(code).toContain('mutate.status');
      expect(code).toContain('emit DocumentSubmitted on documents.submitted');
      expect(code).toContain('Document-->>-Client: void');
    });

    it('shows policies in sequence diagram', () => {
      const commands: IRCommand[] = [
        {
          name: 'delete',
          entity: 'Task',
          parameters: [],
          guards: [],
          policies: ['AdminOnly'],
          actions: [],
          emits: [],
        },
      ];

      const ir = makeIR({
        entities: [makeEntity({ name: 'Task', commands: ['delete'] })],
        commands,
      });

      const result = projection.generate(ir, { surface: 'mermaid.sequence' });
      const code = result.artifacts[0].code;
      expect(code).toContain('Policies: AdminOnly');
    });

    it('returns info when no commands exist', () => {
      const ir = makeIR();
      const result = projection.generate(ir, { surface: 'mermaid.sequence' });
      expect(result.artifacts).toHaveLength(0);
      expect(result.diagnostics[0].code).toBe('NO_COMMANDS');
    });

    it('filters by entity', () => {
      const commands: IRCommand[] = [
        { name: 'cmd1', entity: 'A', parameters: [], guards: [], actions: [], emits: [] },
        { name: 'cmd2', entity: 'B', parameters: [], guards: [], actions: [], emits: [] },
      ];

      const ir = makeIR({
        entities: [
          makeEntity({ name: 'A', commands: ['cmd1'] }),
          makeEntity({ name: 'B', commands: ['cmd2'] }),
        ],
        commands,
      });

      const result = projection.generate(ir, {
        surface: 'mermaid.sequence',
        entity: 'A',
      });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].id).toBe('mermaid.sequence.A.cmd1');
    });
  });

  // ─── Combined (mermaid.all) ─────────────────────────────────────────

  describe('All diagrams (mermaid.all)', () => {
    it('generates ER, state, and sequence diagrams together', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Order',
            properties: [
              { name: 'id', type: { name: 'string', nullable: false }, modifiers: ['required'] },
              { name: 'status', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'pending' } },
            ],
            relationships: [
              { name: 'items', kind: 'hasMany', target: 'OrderItem' },
            ],
            transitions: [
              { property: 'status', from: 'pending', to: ['confirmed'] },
              { property: 'status', from: 'confirmed', to: ['shipped'] },
            ],
            commands: ['confirm'],
          }),
          makeEntity({ name: 'OrderItem', properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: [] }] }),
        ],
        commands: [
          {
            name: 'confirm',
            entity: 'Order',
            parameters: [],
            guards: [],
            actions: [
              { kind: 'mutate', target: 'status', expression: { kind: 'literal', value: { kind: 'string', value: 'confirmed' } } },
            ],
            emits: [],
          },
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.all' });

      // Should have ER diagram + state diagram for Order + sequence diagram for confirm
      const ids = result.artifacts.map(a => a.id);
      expect(ids).toContain('mermaid.er');
      expect(ids).toContain('mermaid.state.Order');
      expect(ids).toContain('mermaid.sequence.Order.confirm');
    });
  });

  // ─── Path hints ─────────────────────────────────────────────────────

  describe('artifact path hints', () => {
    it('uses .mmd extension for ER diagrams', () => {
      const ir = makeIR({
        entities: [makeEntity({ name: 'X', properties: [{ name: 'id', type: { name: 'string', nullable: false }, modifiers: [] }] })],
      });

      const result = projection.generate(ir, { surface: 'mermaid.er' });
      expect(result.artifacts[0].pathHint).toBe('diagrams/er-diagram.mmd');
    });

    it('uses entity name in state diagram path hint', () => {
      const ir = makeIR({
        entities: [
          makeEntity({
            name: 'Ticket',
            properties: [{ name: 'status', type: { name: 'string', nullable: false }, modifiers: [], defaultValue: { kind: 'string', value: 'open' } }],
            transitions: [{ property: 'status', from: 'open', to: ['closed'] }],
          }),
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.state' });
      expect(result.artifacts[0].pathHint).toBe('diagrams/state-Ticket.mmd');
    });

    it('uses entity and command names in sequence diagram path hint', () => {
      const ir = makeIR({
        entities: [makeEntity({ name: 'Task', commands: ['start'] })],
        commands: [
          { name: 'start', entity: 'Task', parameters: [], guards: [], actions: [], emits: [] },
        ],
      });

      const result = projection.generate(ir, { surface: 'mermaid.sequence' });
      expect(result.artifacts[0].pathHint).toBe('diagrams/sequence-Task-start.mmd');
    });
  });
});
