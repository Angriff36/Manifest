/**
 * Regression: convex.queries publicity and convex.react hooks must share the
 * same client-readability decision (resolveConvexReadVisibility).
 *
 * - Internal-only (gated, no auth seam) → internalQuery, no useQuery hooks.
 * - Authenticated frontend (gated + auth + renderable) → public query + hooks.
 */

import { describe, it, expect } from 'vitest';
import type { IR, IREntity, IRPolicy, IRProperty, IRStore } from '../../ir';
import { ConvexProjection } from './generator.js';

function emptyIR(): IR {
  return {
    version: '1.0',
    provenance: {
      contentHash: 'h',
      compilerVersion: 'test',
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
  };
}

function prop(name: string, typeName: string, modifiers: IRProperty['modifiers'] = []): IRProperty {
  return { name, type: { name: typeName, nullable: false }, modifiers };
}

function entity(name: string, props: IRProperty[]): IREntity {
  return {
    name,
    properties: props,
    computedProperties: [],
    relationships: [],
    commands: [],
    constraints: [],
    policies: [],
  };
}

function durable(name: string): IRStore {
  return { entity: name, target: 'durable', config: {} };
}

function readPolicy(entityName: string, name: string, allow: boolean): IRPolicy {
  return {
    name,
    entity: entityName,
    action: 'read',
    expression: { kind: 'literal', value: { kind: 'boolean', value: allow } },
  };
}

/** Authenticated read: requires getAuthContext in the public query handler. */
function userRoleReadPolicy(entityName: string, name: string): IRPolicy {
  return {
    name,
    entity: entityName,
    action: 'read',
    expression: {
      kind: 'binary',
      operator: '==',
      left: {
        kind: 'member',
        object: { kind: 'identifier', name: 'user' },
        property: 'role',
      },
      right: { kind: 'literal', value: { kind: 'string', value: 'admin' } },
    },
  };
}

describe('convex query ↔ react visibility contract', () => {
  it('keeps gated reads internal with no React hooks when auth seam is absent', () => {
    const ir = emptyIR();
    ir.entities = [entity('Secret', [prop('token', 'string', ['required'])])];
    ir.stores = [durable('Secret')];
    ir.policies = [readPolicy('Secret', 'denyRead', false)];

    const proj = new ConvexProjection();
    const queries = proj.generate(ir, { surface: 'convex.queries' }).artifacts[0]!.code;
    const react = proj.generate(ir, { surface: 'convex.react' }).artifacts[0]!.code;

    expect(queries).toContain('export const listSecret = internalQuery({');
    expect(queries).toContain('export const getSecret = internalQuery({');
    expect(queries).not.toContain('export const listSecret = query({');
    expect(react).not.toContain('useListSecret');
    expect(react).not.toContain('useGetSecret');
    expect(react).not.toContain('api.queries.listSecret');
  });

  it('emits public policy-enforcing queries and matching React hooks with auth seam', () => {
    const ir = emptyIR();
    ir.entities = [entity('Event', [prop('title', 'string', ['required'])])];
    ir.stores = [durable('Event')];
    ir.policies = [userRoleReadPolicy('Event', 'eventRead')];

    const opts = { authContextImport: './lib/authContext' };
    const proj = new ConvexProjection();
    const queries = proj.generate(ir, { surface: 'convex.queries', options: opts }).artifacts[0]!
      .code;
    const react = proj.generate(ir, { surface: 'convex.react', options: opts }).artifacts[0]!.code;

    expect(queries).toContain('export const listEvent = query({');
    expect(queries).toContain('export const getEvent = query({');
    expect(queries).not.toContain('export const listEvent = internalQuery({');
    expect(queries).toContain('__allowsRead("eventRead", "Event"');
    expect(queries).toContain('getAuthContext');
    expect(queries).toContain('user.role === "admin"');
    expect(react).toContain('useListEvent');
    expect(react).toContain('useGetEvent');
    expect(react).toContain('api.queries.listEvent');
    expect(react).toContain('api.queries.getEvent');
  });
});
