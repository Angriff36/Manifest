import type { PrismaProjectionOptions } from '../prisma/options.js';
import { normalizeOptions as normalizePrismaOptions } from '../prisma/options.js';

export type PrismaStoreProjectionOptions = PrismaProjectionOptions & {
  /** Per-entity Prisma client delegate override (e.g. OrderLine → order_lines). */
  accessorNames?: Record<string, string>;
  /** Output path for metadata artifact. Default: prisma-model-metadata.generated.ts */
  metadataOutput?: string;
  /** Output path for registry artifact. Default: prisma-store-registry.generated.ts */
  registryOutput?: string;
  /** Import path for GenericPrismaStore in registry artifact. */
  storeImportPath?: string;
  /** Import path for metadata module in registry artifact. */
  metadataImportPath?: string;
};

export const PRISMA_STORE_DEFAULTS = {
  metadataOutput: 'prisma-model-metadata.generated.ts',
  registryOutput: 'prisma-store-registry.generated.ts',
  storeImportPath: '@angriff36/manifest/stores/prisma-generic',
  metadataImportPath: './prisma-model-metadata.generated.js',
} as const;

export function normalizeStoreOptions(
  raw: Record<string, unknown> | undefined,
): PrismaStoreProjectionOptions {
  const base = normalizePrismaOptions(raw);
  const input = (raw ?? {}) as Partial<PrismaStoreProjectionOptions>;
  return {
    ...base,
    accessorNames: input.accessorNames ?? {},
    metadataOutput: input.metadataOutput ?? PRISMA_STORE_DEFAULTS.metadataOutput,
    registryOutput: input.registryOutput ?? PRISMA_STORE_DEFAULTS.registryOutput,
    storeImportPath: input.storeImportPath ?? PRISMA_STORE_DEFAULTS.storeImportPath,
    metadataImportPath: input.metadataImportPath ?? PRISMA_STORE_DEFAULTS.metadataImportPath,
  };
}
