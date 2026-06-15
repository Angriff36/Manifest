/**
 * Metadata shapes consumed by {@link GenericPrismaStore}.
 * Emitted by the `prisma-store.metadata` projection surface.
 */

export interface PrismaFieldMeta {
  /** Physical Prisma field / column name. */
  name: string;
  /** Manifest IR property name (camelCase API contract). */
  irName: string;
  /** Prisma scalar name (String, Int, Decimal, …) or enum name. */
  type: string;
  isEnum: boolean;
  isList: boolean;
  optional: boolean;
  hasDefault: boolean;
  isUpdatedAt: boolean;
  isId: boolean;
}

export interface PrismaModelMeta {
  /** Prisma client delegate key (e.g. `user`, `order_lines`). */
  accessor: string;
  /** Physical table name from @@map, or null when same as model name. */
  dbName: string | null;
  /** PostgreSQL schema from @@schema, or null for default schema. */
  pgSchema: string | null;
  pkFields: string[];
  /** Prisma compound-unique accessor for composite PKs (e.g. `tenantId_id`). */
  whereAccessor: string;
  hasDeletedAt: boolean;
  /**
   * Status-based soft-delete (alternative to a `deletedAt` timestamp column).
   * When set, delete() transitions the named physical column to `deletedValue`
   * instead of stamping a timestamp or hard-deleting, and reads exclude rows
   * already at that value. Independent of `hasDeletedAt` (both may apply).
   */
  softDeleteStatus?: { column: string; deletedValue: string };
  /** When true, create() uses `tenant: { connect: { id } }` instead of scalar tenantId. */
  requiresTenantConnect?: boolean;
  versionProperty?: string;
  fields: PrismaFieldMeta[];
}

export type PrismaModelMetadata = Record<string, PrismaModelMeta>;
