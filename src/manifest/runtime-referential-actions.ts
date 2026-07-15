/**
 * Reference-runtime enforcement of IR referential actions (`onDelete` / `onUpdate`).
 *
 * Declared on `belongsTo` / `ref` relationships (child → parent). When the parent
 * is deleted or its referenced identity columns change, the action applies to
 * matching child rows. Absent action = `noAction` (orphans remain).
 *
 * See docs/spec/semantics.md § Referential Actions (runtime).
 */

import type { IREntity, IRForeignKey, IRRelationship, RefAction } from './ir';

export type EntityInstance = Record<string, unknown> & { id: string };

/** Thrown when `onDelete`/`onUpdate: restrict` finds dependent children. */
export class ManifestReferentialRestrictError extends Error {
  readonly parentEntity: string;
  readonly parentId: string;
  readonly childEntity: string;
  readonly relationshipName: string;
  readonly action: 'onDelete' | 'onUpdate';

  constructor(args: {
    parentEntity: string;
    parentId: string;
    childEntity: string;
    relationshipName: string;
    action: 'onDelete' | 'onUpdate';
  }) {
    super(
      `REFERENTIAL_RESTRICT: cannot ${args.action === 'onDelete' ? 'delete' : 'update'} ` +
        `${args.parentEntity}('${args.parentId}') — ${args.childEntity}.${args.relationshipName} ` +
        `declares ${args.action}: restrict and dependent rows exist`,
    );
    this.name = 'ManifestReferentialRestrictError';
    this.parentEntity = args.parentEntity;
    this.parentId = args.parentId;
    this.childEntity = args.childEntity;
    this.relationshipName = args.relationshipName;
    this.action = args.action;
  }
}

/** Thrown when `setNull` targets a non-nullable / required FK property. */
export class ManifestReferentialSetNullError extends Error {
  readonly childEntity: string;
  readonly property: string;

  constructor(childEntity: string, property: string) {
    super(
      `REFERENTIAL_SET_NULL: cannot null ${childEntity}.${property} — property is required/non-nullable`,
    );
    this.name = 'ManifestReferentialSetNullError';
    this.childEntity = childEntity;
    this.property = property;
  }
}

export interface ReferentialActionHost {
  getEntity(name: string): IREntity | undefined;
  getAllEntities(): IREntity[];
  getAllInstancesRaw(entityName: string): Promise<EntityInstance[]>;
  getInstanceRaw(entityName: string, id: string): Promise<EntityInstance | undefined>;
  deleteInstanceRaw(entityName: string, id: string): Promise<boolean>;
  updateInstanceRaw(
    entityName: string,
    id: string,
    data: Partial<EntityInstance>,
  ): Promise<EntityInstance | undefined>;
  /** Resolve property default for setDefault (IR default or type default). */
  defaultForProperty(entityName: string, propertyName: string): unknown;
  compositeId(entity: IREntity | undefined, instance: Record<string, unknown>): string;
  fkColumnPairs(fk: IRForeignKey, referencedEntity?: IREntity): Array<[string, string]>;
}

interface InboundFk {
  childEntity: IREntity;
  rel: IRRelationship;
  action: RefAction;
}

/**
 * Applies onDelete/onUpdate semantics against in-memory (and other) stores so IR
 * meaning holds even when the store has no native FK engine.
 */
export class ReferentialActionApplier {
  constructor(private readonly host: ReferentialActionHost) {}

  /**
   * Run before the parent row is removed. Cascade deletes children recursively;
   * restrict throws; setNull/setDefault mutate children; noAction is a no-op.
   */
  async applyOnDelete(parentEntityName: string, parentId: string): Promise<void> {
    const parent = await this.host.getInstanceRaw(parentEntityName, parentId);
    if (!parent) return;

    await this.applyAction({
      kind: 'onDelete',
      parentEntityName,
      parentId,
      parentBefore: parent,
      parentAfter: null,
      visiting: new Set(),
    });
  }

  /**
   * Run when referenced identity columns on the parent change. Same action
   * vocabulary as onDelete, applied to children whose FK matched the old values.
   */
  async applyOnUpdate(
    parentEntityName: string,
    parentId: string,
    before: EntityInstance,
    after: EntityInstance,
  ): Promise<void> {
    const parentEntity = this.host.getEntity(parentEntityName);
    if (!parentEntity) return;

    const changedRefs = this.changedReferencedColumns(parentEntityName, before, after);
    if (changedRefs.size === 0) return;

    await this.applyAction({
      kind: 'onUpdate',
      parentEntityName,
      parentId,
      parentBefore: before,
      parentAfter: after,
      visiting: new Set(),
      changedRemoteColumns: changedRefs,
    });
  }

  private changedReferencedColumns(
    parentEntityName: string,
    before: EntityInstance,
    after: EntityInstance,
  ): Set<string> {
    const changed = new Set<string>();
    for (const inbound of this.inboundRelationships(parentEntityName, 'onUpdate')) {
      const pairs = this.pairsFor(inbound.rel, parentEntityName);
      for (const [, remote] of pairs) {
        if (before[remote] !== after[remote]) changed.add(remote);
      }
    }
    // Bare id identity: children often reference `id` via `${rel}Id`
    if (before.id !== after.id) changed.add('id');
    return changed;
  }

  private inboundRelationships(
    parentEntityName: string,
    which: 'onDelete' | 'onUpdate',
  ): InboundFk[] {
    const out: InboundFk[] = [];
    for (const entity of this.host.getAllEntities()) {
      for (const rel of entity.relationships) {
        if (rel.kind !== 'belongsTo' && rel.kind !== 'ref') continue;
        if (rel.target !== parentEntityName) continue;
        const action = which === 'onDelete' ? rel.onDelete : rel.onUpdate;
        if (!action || action === 'noAction') continue;
        out.push({ childEntity: entity, rel, action });
      }
    }
    return out;
  }

  private pairsFor(rel: IRRelationship, parentEntityName: string): Array<[string, string]> {
    const parent = this.host.getEntity(parentEntityName);
    if (rel.foreignKey && rel.foreignKey.fields.length > 0) {
      const fk = rel.foreignKey;
      // Explicit references (or composite with parent `key`) — use shared pairing.
      if (fk.references && fk.references.length === fk.fields.length) {
        return this.host.fkColumnPairs(fk, parent);
      }
      if (fk.fields.length > 1) {
        return this.host.fkColumnPairs(fk, parent);
      }
      // Single-column FK without references: local field → parent identity (`id`,
      // or the sole `key` column). Matches resolveRelationship's convention.
      const remote =
        parent?.key && parent.key.length === 1 ? parent.key[0]! : 'id';
      return [[fk.fields[0]!, remote]];
    }
    return [[`${rel.name}Id`, 'id']];
  }

  private childMatchesParent(
    child: EntityInstance,
    pairs: Array<[string, string]>,
    parentSnapshot: EntityInstance,
  ): boolean {
    return pairs.every(([local, remote]) => {
      const cv = child[local];
      if (cv === undefined || cv === null) return false;
      return cv === parentSnapshot[remote];
    });
  }

  private async applyAction(ctx: {
    kind: 'onDelete' | 'onUpdate';
    parentEntityName: string;
    parentId: string;
    parentBefore: EntityInstance;
    parentAfter: EntityInstance | null;
    visiting: Set<string>;
    changedRemoteColumns?: Set<string>;
  }): Promise<void> {
    const visitKey = `${ctx.parentEntityName}:${ctx.parentId}`;
    if (ctx.visiting.has(visitKey)) return;
    ctx.visiting.add(visitKey);

    const inbound = this.inboundRelationships(ctx.parentEntityName, ctx.kind);

    // Restrict first: fail closed before any mutation.
    for (const { childEntity, rel, action } of inbound) {
      if (action !== 'restrict') continue;
      const pairs = this.pairsFor(rel, ctx.parentEntityName);
      if (ctx.kind === 'onUpdate' && ctx.changedRemoteColumns) {
        const touches = pairs.some(([, remote]) => ctx.changedRemoteColumns!.has(remote));
        if (!touches) continue;
      }
      const children = await this.host.getAllInstancesRaw(childEntity.name);
      const hit = children.find((c) => this.childMatchesParent(c, pairs, ctx.parentBefore));
      if (hit) {
        throw new ManifestReferentialRestrictError({
          parentEntity: ctx.parentEntityName,
          parentId: ctx.parentId,
          childEntity: childEntity.name,
          relationshipName: rel.name,
          action: ctx.kind,
        });
      }
    }

    for (const { childEntity, rel, action } of inbound) {
      if (action === 'restrict') continue;
      const pairs = this.pairsFor(rel, ctx.parentEntityName);
      if (ctx.kind === 'onUpdate' && ctx.changedRemoteColumns) {
        const touches = pairs.some(([, remote]) => ctx.changedRemoteColumns!.has(remote));
        if (!touches) continue;
      }

      const children = await this.host.getAllInstancesRaw(childEntity.name);
      const matching = children.filter((c) =>
        this.childMatchesParent(c, pairs, ctx.parentBefore),
      );

      for (const child of matching) {
        const childId = String(child.id);
        if (action === 'cascade') {
          if (ctx.kind === 'onDelete') {
            await this.applyAction({
              kind: 'onDelete',
              parentEntityName: childEntity.name,
              parentId: childId,
              parentBefore: child,
              parentAfter: null,
              visiting: ctx.visiting,
            });
            await this.host.deleteInstanceRaw(childEntity.name, childId);
          } else if (ctx.parentAfter) {
            // onUpdate cascade: propagate new referenced values onto the child FK
            const patch: Partial<EntityInstance> = {};
            for (const [local, remote] of pairs) {
              if (ctx.changedRemoteColumns?.has(remote)) {
                patch[local] = ctx.parentAfter[remote];
              }
            }
            if (Object.keys(patch).length > 0) {
              await this.host.updateInstanceRaw(childEntity.name, childId, patch);
            }
          }
        } else if (action === 'setNull') {
          const patch: Partial<EntityInstance> = {};
          for (const [local] of pairs) {
            this.assertNullable(childEntity, local);
            patch[local] = null;
          }
          await this.host.updateInstanceRaw(childEntity.name, childId, patch);
        } else if (action === 'setDefault') {
          const patch: Partial<EntityInstance> = {};
          for (const [local] of pairs) {
            patch[local] = this.host.defaultForProperty(childEntity.name, local);
          }
          await this.host.updateInstanceRaw(childEntity.name, childId, patch);
        }
      }
    }
  }

  private assertNullable(entity: IREntity, propertyName: string): void {
    const prop = entity.properties.find((p) => p.name === propertyName);
    // Undeclared synthetic `${rel}Id` — allow null (no column nullability contract).
    if (!prop) return;
    if (prop.type.nullable === false) {
      throw new ManifestReferentialSetNullError(entity.name, propertyName);
    }
  }
}
