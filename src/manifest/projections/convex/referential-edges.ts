/**
 * Collect inbound referential edges (single-column + composite) for Convex emit.
 */

import type { IR, IREntity, IRRelationship, IRValue, RefAction } from '../../ir';
import type { ProjectionDiagnostic } from '../interface';
import {
  isPersistentEntity,
  resolveConvexTableName,
  type NormalizedOptions,
} from './generator.js';

export interface FkPair {
  local: string;
  remote: string;
}

export interface InboundReferentialEdge {
  parentEntity: string;
  childEntity: string;
  childTable: string;
  relationshipName: string;
  pairs: FkPair[];
  indexName: string;
  action: RefAction;
  /** TS literal(s) for setNull / setDefault — one per local pair, same order. */
  patchValues?: string[];
}

/** @deprecated alias */
export type InboundOnDeleteEdge = InboundReferentialEdge;

function defaultLiteral(value: IRValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
    case 'array':
      return `[${value.elements.map(defaultLiteral).join(', ')}]`;
    case 'object':
      return `{${Object.entries(value.properties)
        .map(([key, nested]) => `${JSON.stringify(key)}: ${defaultLiteral(nested)}`)
        .join(', ')}}`;
  }
}

function typeDefaultLiteral(typeName: string | undefined, nullable: boolean | undefined): string {
  if (nullable) return 'null';
  switch (typeName) {
    case 'string':
      return '""';
    case 'number':
    case 'int':
    case 'float':
    case 'decimal':
    case 'money':
      return '0';
    case 'boolean':
      return 'false';
    case 'array':
    case 'list':
      return '[]';
    default:
      return 'null';
  }
}

/**
 * Pair local FK columns to parent remote columns (runtime fkColumnPairs parity).
 *
 * Tenant-scoped Convex id FKs (`[tenantId, parentId]` → `[tenantId, id]`) collapse
 * to the non-tenant identity pair so they share `by_parentId` with schema emit.
 * True business-key composites keep every column.
 */
export function resolveFkPairs(
  rel: IRRelationship,
  parent: IREntity | undefined,
  tenantProp: string | undefined,
  options: NormalizedOptions,
  childName: string,
): FkPair[] {
  const override = options.references[childName]?.[rel.name];
  if (override) {
    const remote =
      rel.foreignKey?.references?.[0] ??
      (parent?.key && parent.key.length === 1 ? parent.key[0]! : 'id');
    return [{ local: override, remote }];
  }
  const fk = rel.foreignKey;
  if (!fk?.fields?.length) {
    return [{ local: `${rel.name}Id`, remote: 'id' }];
  }
  const refs =
    fk.references && fk.references.length === fk.fields.length
      ? fk.references
      : parent?.key && parent.key.length === fk.fields.length
        ? parent.key
        : fk.fields.length === 1
          ? [parent?.key?.[0] ?? 'id']
          : fk.fields;

  const identityIdx = refs.findIndex(
    (reference, index) => reference === 'id' && fk.fields[index] !== tenantProp,
  );
  if (fk.fields.length > 1 && identityIdx >= 0) {
    return [{ local: fk.fields[identityIdx]!, remote: 'id' }];
  }

  return fk.fields.map((local, index) => ({
    local,
    remote: refs[index] ?? local,
  }));
}

export function compositeIndexName(pairs: FkPair[]): string {
  return `by_${pairs.map((pair) => pair.local).join('_')}`;
}

function resolveSetPatchValues(
  child: IREntity,
  pairs: FkPair[],
  action: 'setNull' | 'setDefault',
  which: 'onDelete' | 'onUpdate',
  relName: string,
): { patchValues?: string[]; diagnostic?: ProjectionDiagnostic } {
  if (action === 'setNull') {
    for (const pair of pairs) {
      const prop = child.properties.find((property) => property.name === pair.local);
      if (prop && prop.type.nullable === false) {
        return {
          diagnostic: {
            severity: 'error',
            code: 'CONVEX_UNSUPPORTED_REFERENTIAL_SET',
            entity: child.name,
            message:
              `Relationship '${child.name}.${relName}' declares ${which}:setNull but ` +
              `'${pair.local}' is non-nullable — cannot clear the FK.`,
          },
        };
      }
    }
    return { patchValues: pairs.map(() => 'undefined') };
  }
  return {
    patchValues: pairs.map((pair) => {
      const prop = child.properties.find((property) => property.name === pair.local);
      if (prop?.defaultValue) return defaultLiteral(prop.defaultValue);
      return typeDefaultLiteral(prop?.type.name, prop?.type.nullable);
    }),
  };
}

function collectInboundEdges(
  ir: IR,
  options: NormalizedOptions,
  which: 'onDelete' | 'onUpdate',
): { edges: InboundReferentialEdge[]; diagnostics: ProjectionDiagnostic[] } {
  const diagnostics: ProjectionDiagnostic[] = [];
  const edges: InboundReferentialEdge[] = [];
  const tenantProp = options.tenantIdProperty ?? ir.tenant?.property;

  for (const child of ir.entities) {
    if (!isPersistentEntity(child, ir)) continue;
    for (const rel of child.relationships) {
      if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
      const action = which === 'onDelete' ? rel.onDelete : rel.onUpdate;
      if (!action || action === 'noAction') continue;

      const parent = ir.entities.find((entity) => entity.name === rel.target);
      if (!parent || !isPersistentEntity(parent, ir)) continue;

      const pairs = resolveFkPairs(rel, parent, tenantProp, options, child.name);
      if (pairs.length === 0) continue;

      let patchValues: string[] | undefined;
      if (action === 'setNull' || action === 'setDefault') {
        const resolved = resolveSetPatchValues(child, pairs, action, which, rel.name);
        if (resolved.diagnostic) {
          diagnostics.push(resolved.diagnostic);
          continue;
        }
        patchValues = resolved.patchValues;
      } else if (action !== 'cascade' && action !== 'restrict') {
        continue;
      }

      edges.push({
        parentEntity: parent.name,
        childEntity: child.name,
        childTable: resolveConvexTableName(child.name, options),
        relationshipName: rel.name,
        pairs,
        indexName: compositeIndexName(pairs),
        action,
        ...(patchValues ? { patchValues } : {}),
      });
    }
  }

  return { edges, diagnostics };
}

export function collectInboundOnDeleteEdges(ir: IR, options: NormalizedOptions) {
  return collectInboundEdges(ir, options, 'onDelete');
}

export function collectInboundOnUpdateEdges(ir: IR, options: NormalizedOptions) {
  return collectInboundEdges(ir, options, 'onUpdate');
}
