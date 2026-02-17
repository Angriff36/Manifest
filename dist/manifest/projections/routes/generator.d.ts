/**
 * Canonical Routes projection for Manifest IR.
 *
 * Generates the route surface artifact — a deterministic, IR-derived
 * description of all transport endpoints plus typed path builders.
 *
 * Routes are projection artifacts, not application concerns.
 * No filesystem scanning. No framework inference. No implicit discovery.
 *
 * Surfaces:
 *   - routes.manifest  → routes.manifest.json (canonical route list)
 *   - routes.ts        → routes.ts (typed path builders)
 *
 * See docs/spec/manifest-vnext.md § "Canonical Routes (Normative)".
 */
import type { IR } from '../../ir';
import type { ProjectionTarget, ProjectionRequest, ProjectionResult } from '../interface';
/**
 * Canonical Routes projection.
 *
 * Surfaces:
 *   - routes.manifest → routes.manifest.json
 *   - routes.ts       → routes.ts (typed path builders)
 */
export declare class RoutesProjection implements ProjectionTarget {
    readonly name = "routes";
    readonly description = "Canonical route surface \u2014 deterministic route manifest and typed path builders";
    readonly surfaces: readonly ["routes.manifest", "routes.ts"];
    generate(ir: IR, request: ProjectionRequest): ProjectionResult;
}
export type { RouteEntry, RouteManifest, RouteParam, RoutesProjectionOptions, ManualRouteDeclaration } from './types';
//# sourceMappingURL=generator.d.ts.map