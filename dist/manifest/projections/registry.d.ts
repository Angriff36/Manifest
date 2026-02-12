/**
 * Projection registry for managing platform-specific code generators.
 *
 * Projections are registered at startup and can be retrieved by name.
 * The registry uses memoized initialization to prevent "silent failure theater".
 *
 * KEY: getProjection() auto-registers builtins on first call.
 * Consumers don't need to think about startup ordering.
 */
import type { ProjectionTarget } from './interface';
/**
 * Register a projection target.
 *
 * @param projection - The projection to register
 * @throws Error if a projection with the same name is already registered
 */
export declare function registerProjection(projection: ProjectionTarget): void;
/**
 * Get a registered projection by name.
 *
 * IMPORTANT: This function automatically registers builtins on first call.
 * Consumers don't need to call registerAllBuiltinProjections() manually.
 *
 * @param name - The unique identifier of the projection
 * @returns The projection if found, undefined otherwise
 */
export declare function getProjection(name: string): ProjectionTarget | undefined;
/**
 * List all registered projections.
 *
 * @returns Array of all registered projections
 */
export declare function listProjections(): ProjectionTarget[];
/**
 * Check if a projection is registered.
 *
 * @param name - The unique identifier of the projection
 * @returns true if the projection is registered, false otherwise
 */
export declare function hasProjection(name: string): boolean;
/**
 * Clear all registered projections.
 * Useful for testing or resetting the registry state.
 */
export declare function clearProjections(): void;
/**
 * Get the names of all registered projections.
 *
 * @returns Array of projection names
 */
export declare function getProjectionNames(): string[];
/**
 * Force registration of all built-in projections.
 *
 * This is called automatically by getProjection(), but can be called
 * explicitly if needed for startup validation or testing.
 */
export declare function ensureBuiltinProjections(): void;
//# sourceMappingURL=registry.d.ts.map