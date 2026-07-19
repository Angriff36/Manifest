/**
 * Product wiring projection.
 *
 * Emits machine-readable wiring contracts and safe TypeScript bindings so
 * applications/agents can connect UI to Manifest commands without guessing
 * contracts or inventing product behavior.
 *
 * Surfaces:
 *   - wiring.contract  → manifest-wiring-contract.json
 *   - wiring.bindings  → TypeScript client/server binding helpers
 *   - wiring.all       → both artifacts
 *
 * NOT a UI generator — no pages, forms, buttons, or layout.
 */

import type { IR } from '../../ir.js';
import type {
  ProjectionTarget,
  ProjectionRequest,
  ProjectionResult,
  ProjectionArtifact,
  ProjectionDiagnostic,
} from '../interface.js';
import { buildWiringContract } from './contract-builder.js';
import { generateWiringBindings } from './bindings-generator.js';
import type { WiringProjectionOptions } from './types.js';
import { WIRING_DESCRIPTOR_META } from './descriptor-meta.js';

const SURFACE_CONTRACT = 'wiring.contract' as const;
const SURFACE_BINDINGS = 'wiring.bindings' as const;
const SURFACE_ALL = 'wiring.all' as const;
const SURFACES = [SURFACE_CONTRACT, SURFACE_BINDINGS, SURFACE_ALL] as const;

function normalizeOptions(raw?: Record<string, unknown>): WiringProjectionOptions {
  const o = (raw ?? {}) as WiringProjectionOptions;
  return {
    appDir: o.appDir,
    apiBasePath: o.apiBasePath,
    dispatcherBasePath: o.dispatcherBasePath,
    routeSegments: o.routeSegments,
    routeCasing: o.routeCasing,
    dateSerialization: o.dateSerialization ?? 'iso-string',
    runtimeImportPath: o.runtimeImportPath ?? '@/lib/manifest-runtime',
    contractPathHint: o.contractPathHint ?? 'src/generated/manifest-wiring-contract.json',
    bindingsPathHint: o.bindingsPathHint ?? 'src/generated/manifest-wiring-bindings.ts',
  };
}

export class WiringProjection implements ProjectionTarget {
  readonly name = 'wiring';
  readonly description = 'Product wiring contract + safe command bindings (not a UI generator)';
  readonly surfaces = SURFACES;
  readonly descriptorMeta = WIRING_DESCRIPTOR_META;

  generate(ir: IR, request: ProjectionRequest): ProjectionResult {
    const diagnostics: ProjectionDiagnostic[] = [];
    const opts = normalizeOptions(request.options);
    const surface = request.surface;

    if (!SURFACES.includes(surface as (typeof SURFACES)[number])) {
      return {
        artifacts: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'WIRING_UNKNOWN_SURFACE',
            message: `Unknown wiring surface '${surface}'. Supported: ${SURFACES.join(', ')}`,
          },
        ],
      };
    }

    const contract = buildWiringContract(ir, opts);
    const artifacts: ProjectionArtifact[] = [];

    if (surface === SURFACE_CONTRACT || surface === SURFACE_ALL) {
      artifacts.push({
        id: 'wiring-contract',
        pathHint: opts.contractPathHint,
        contentType: 'json',
        code: `${JSON.stringify(contract, null, 2)}\n`,
      });
    }

    if (surface === SURFACE_BINDINGS || surface === SURFACE_ALL) {
      artifacts.push({
        id: 'wiring-bindings',
        pathHint: opts.bindingsPathHint,
        contentType: 'typescript',
        code: generateWiringBindings(contract),
      });
    }

    if (contract.capabilities.length === 0) {
      diagnostics.push({
        severity: 'info',
        code: 'WIRING_EMPTY',
        message: 'No commands in IR — wiring contract is empty',
      });
    }

    return { artifacts, diagnostics };
  }
}
