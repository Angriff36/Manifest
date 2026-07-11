/**
 * Metadata-driven Prisma Store implementation for durable Manifest entities.
 *
 * One class serves every entity whose Prisma model matches the metadata contract:
 * standard scalar columns, optional soft-delete, single or composite PK.
 */

import type { EntityInstance, Store } from '../../runtime-engine.js';
import {
  asBool,
  asJsonInput,
  asNullableDate,
  asNullableNumber,
  asNullableString,
  asString,
  asStringArray,
  toDecimalInput,
} from './coercion.js';
import type { PrismaFieldMeta, PrismaModelMeta, PrismaModelMetadata } from './types.js';

interface PrismaDelegate {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  deleteMany(args: unknown): Promise<unknown>;
}

export class GenericPrismaStore implements Store<EntityInstance> {
  private readonly meta: PrismaModelMeta;
  private readonly delegate: PrismaDelegate;

  constructor(
    prisma: unknown,
    entityName: string,
    private readonly tenantId: string,
    metadata: PrismaModelMetadata,
  ) {
    const meta = metadata[entityName];
    if (!meta) {
      throw new Error(
        `GenericPrismaStore: no Prisma metadata for entity "${entityName}". ` +
          'Regenerate prisma-store.metadata from Manifest IR.',
      );
    }
    const delegate = (prisma as Record<string, unknown>)[meta.accessor] as
      PrismaDelegate | undefined;
    if (!delegate || typeof delegate.findMany !== 'function') {
      throw new Error(
        `GenericPrismaStore: Prisma client has no delegate "${meta.accessor}" for entity "${entityName}".`,
      );
    }
    this.meta = meta;
    this.delegate = delegate;
  }

  private tenantField(): PrismaFieldMeta | undefined {
    return this.meta.fields.find(
      (f) => f.irName === 'tenantId' || f.name === 'tenantId' || f.name === 'tenant_id',
    );
  }

  /**
   * The soft-delete field, resolved by IR name (`deletedAt` is a stable
   * framework convention) so the physical column can be remapped freely.
   * Used by both tenantFilter() and delete() so the resolved column name is
   * applied consistently — never hardcoded.
   */
  private deletedAtField(): PrismaFieldMeta | undefined {
    return this.meta.fields.find(
      (f) => f.irName === 'deletedAt' || f.name === 'deletedAt' || f.name === 'deleted_at',
    );
  }

  private coerce(field: PrismaFieldMeta, value: unknown): unknown {
    if (field.isList) return asStringArray(value);
    switch (field.type) {
      case 'Decimal':
        return toDecimalInput(value);
      case 'Int':
      case 'BigInt':
      case 'Float':
        return asNullableNumber(value);
      case 'Boolean':
        return asBool(value);
      case 'DateTime':
        return asNullableDate(value);
      case 'Json':
        return asJsonInput(value);
      default:
        return field.optional ? asNullableString(value) : asString(value);
    }
  }

  private buildCreateData(data: Partial<EntityInstance>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const now = new Date();
    for (const field of this.meta.fields) {
      if (field.isUpdatedAt) continue;
      if (field.irName === 'tenantId' || field.name === 'tenantId' || field.name === 'tenant_id') {
        if (this.meta.requiresTenantConnect) {
          out.tenant = { connect: { id: this.tenantId } };
        } else {
          out[field.name] = this.tenantId;
        }
        continue;
      }
      if (field.name === 'id') {
        out.id = (data.id as string | undefined) ?? crypto.randomUUID();
        continue;
      }
      const raw = data[field.irName] !== undefined ? data[field.irName] : data[field.name];
      if (raw === undefined) {
        if (!field.hasDefault && !field.optional && field.type === 'DateTime') {
          out[field.name] = now;
        }
        continue;
      }
      out[field.name] = this.coerce(field, raw);
    }
    return out;
  }

  private buildPatch(data: Partial<EntityInstance>): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const field of this.meta.fields) {
      if (field.isUpdatedAt) continue;
      if (
        field.irName === 'tenantId' ||
        field.name === 'tenantId' ||
        field.name === 'tenant_id' ||
        field.name === 'id'
      ) {
        continue;
      }
      const hasIr = data[field.irName] !== undefined;
      const hasRaw = data[field.name] !== undefined;
      if (!hasIr && !hasRaw) continue;
      patch[field.name] = this.coerce(field, hasIr ? data[field.irName] : data[field.name]);
    }
    return patch;
  }

  private whereUnique(id: string): Record<string, unknown> {
    if (this.meta.pkFields.length > 1) {
      const key: Record<string, unknown> = {};
      for (const pf of this.meta.pkFields) {
        key[pf] = pf === 'tenantId' || pf === 'tenant_id' ? this.tenantId : id;
      }
      return { [this.meta.whereAccessor]: key };
    }
    return { [this.meta.pkFields[0]]: id };
  }

  private tenantFilter(extra?: Record<string, unknown>): Record<string, unknown> {
    const tenantCol = this.tenantField()?.name ?? 'tenantId';
    const where: Record<string, unknown> = { [tenantCol]: this.tenantId, ...extra };
    if (this.meta.hasDeletedAt) {
      where[this.deletedAtField()?.name ?? 'deletedAt'] = null;
    }
    // Status-based soft-delete: exclude rows already at the deleted status.
    if (this.meta.softDeleteStatus) {
      const { column, deletedValue } = this.meta.softDeleteStatus;
      where[column] = { not: deletedValue };
    }
    return where;
  }

  private mapToManifestEntity(row: Record<string, unknown>): EntityInstance {
    const entity: EntityInstance = { id: row.id as string };
    for (const field of this.meta.fields) {
      entity[field.irName] = row[field.name] ?? null;
    }
    return entity;
  }

  async getAll(): Promise<EntityInstance[]> {
    const rows = await this.delegate.findMany({
      where: this.tenantFilter(),
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.mapToManifestEntity(r));
  }

  async getById(id: string): Promise<EntityInstance | undefined> {
    const row = await this.delegate.findFirst({ where: this.tenantFilter({ id }) });
    return row ? this.mapToManifestEntity(row) : undefined;
  }

  async create(data: Partial<EntityInstance>): Promise<EntityInstance> {
    const row = await this.delegate.create({ data: this.buildCreateData(data) });
    return this.mapToManifestEntity(row);
  }

  async update(id: string, data: Partial<EntityInstance>): Promise<EntityInstance | undefined> {
    try {
      const where = this.whereUnique(id);
      if (this.meta.versionProperty) {
        const versionField = this.meta.fields.find(
          (f) => f.irName === this.meta.versionProperty || f.name === this.meta.versionProperty,
        );
        const newVersion = versionField
          ? ((data[versionField.irName] ?? data[versionField.name]) as number | undefined)
          : undefined;
        if (versionField && newVersion !== undefined) {
          const fieldName = versionField.name;
          const expectedVersion = newVersion - 1;
          if (this.meta.pkFields.length > 1) {
            const compound = where[this.meta.whereAccessor] as Record<string, unknown>;
            compound[fieldName] = expectedVersion;
          } else {
            where[fieldName] = expectedVersion;
          }
        }
      }
      const row = await this.delegate.update({ where, data: this.buildPatch(data) });
      return this.mapToManifestEntity(row);
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      if (this.meta.softDeleteStatus) {
        // Status-based soft-delete: transition the status column to the deleted
        // sentinel rather than stamping a timestamp or removing the row.
        await this.delegate.update({
          where: this.whereUnique(id),
          data: { [this.meta.softDeleteStatus.column]: this.meta.softDeleteStatus.deletedValue },
        });
      } else if (this.meta.hasDeletedAt) {
        await this.delegate.update({
          where: this.whereUnique(id),
          data: { [this.deletedAtField()?.name ?? 'deletedAt']: new Date() },
        });
      } else {
        await this.delegate.deleteMany({ where: this.tenantFilter({ id }) });
      }
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    const tenantCol = this.tenantField()?.name ?? 'tenantId';
    await this.delegate.deleteMany({ where: { [tenantCol]: this.tenantId } });
  }
}
