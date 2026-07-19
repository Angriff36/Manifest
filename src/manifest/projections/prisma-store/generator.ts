import type { IR } from '../../ir.js';
import type { ProjectionRequest, ProjectionResult, ProjectionTarget } from '../interface.js';
import {
  buildPrismaModelMetadata,
  emitMetadataModule,
  emitRegistryModule,
} from './metadata-builder.js';
import { normalizeStoreOptions } from './options.js';
import { PRISMA_STORE_DESCRIPTOR_META } from './descriptor-meta.js';

export const SURFACE_METADATA = 'prisma-store.metadata';
export const SURFACE_REGISTRY = 'prisma-store.registry';
export const SURFACES = [SURFACE_METADATA, SURFACE_REGISTRY] as const;

export class PrismaStoreProjection implements ProjectionTarget {
  readonly name = 'prisma-store';
  readonly description =
    'Manifest IR → Prisma store metadata and registry for GenericPrismaStore. Compile-time only.';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = PRISMA_STORE_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    if (!SURFACES.includes(request.surface as (typeof SURFACES)[number])) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'UNKNOWN_SURFACE',
            message: `Unknown surface '${request.surface}'. Available: ${SURFACES.join(', ')}.`,
          },
        ],
      };
    }

    const options = normalizeStoreOptions(request.options);
    const { metadata, diagnostics } = buildPrismaModelMetadata(ir, options);
    const entityNames = Object.keys(metadata).sort((a, b) => a.localeCompare(b));

    if (request.surface === SURFACE_METADATA) {
      return {
        artifacts: [
          {
            id: 'prisma-store.metadata',
            pathHint: options.metadataOutput,
            contentType: 'typescript',
            code: emitMetadataModule(metadata),
          },
        ],
        diagnostics,
      };
    }

    return {
      artifacts: [
        {
          id: 'prisma-store.registry',
          pathHint: options.registryOutput,
          contentType: 'typescript',
          code: emitRegistryModule(entityNames, options),
        },
      ],
      diagnostics,
    };
  }
}
