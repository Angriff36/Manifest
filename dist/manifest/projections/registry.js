/**
 * Projection registry for managing platform-specific code generators.
 *
 * Projections are registered at startup and can be retrieved by name.
 * The registry uses memoized initialization to prevent "silent failure theater".
 *
 * KEY: getProjection() auto-registers builtins on first call.
 * Consumers don't need to think about startup ordering.
 */
import { registerBuiltinProjections } from './builtins';
/**
 * Internal registry of all registered projections.
 * Using Map for O(1) lookup by name.
 */
const projections = new Map();
/**
 * Tracks whether builtins have been registered.
 * Prevents duplicate registration and ensures idempotency.
 */
let builtinsRegistered = false;
/**
 * Register a projection target.
 *
 * @param projection - The projection to register
 * @throws Error if a projection with the same name is already registered
 */
export function registerProjection(projection) {
    if (projections.has(projection.name)) {
        throw new Error(`Projection "${projection.name}" is already registered. Projection names must be unique.`);
    }
    projections.set(projection.name, projection);
}
/**
 * Get a registered projection by name.
 *
 * IMPORTANT: This function automatically registers builtins on first call.
 * Consumers don't need to call registerAllBuiltinProjections() manually.
 *
 * @param name - The unique identifier of the projection
 * @returns The projection if found, undefined otherwise
 */
export function getProjection(name) {
    // Memoized init: register builtins exactly once on first access
    if (!builtinsRegistered) {
        registerBuiltinProjections();
        builtinsRegistered = true;
    }
    return projections.get(name);
}
/**
 * List all registered projections.
 *
 * @returns Array of all registered projections
 */
export function listProjections() {
    // Ensure builtins are registered before listing
    if (!builtinsRegistered) {
        registerBuiltinProjections();
        builtinsRegistered = true;
    }
    return Array.from(projections.values());
}
/**
 * Check if a projection is registered.
 *
 * @param name - The unique identifier of the projection
 * @returns true if the projection is registered, false otherwise
 */
export function hasProjection(name) {
    // Ensure builtins are registered before checking
    if (!builtinsRegistered) {
        registerBuiltinProjections();
        builtinsRegistered = true;
    }
    return projections.has(name);
}
/**
 * Clear all registered projections.
 * Useful for testing or resetting the registry state.
 */
export function clearProjections() {
    projections.clear();
    builtinsRegistered = false;
}
/**
 * Get the names of all registered projections.
 *
 * @returns Array of projection names
 */
export function getProjectionNames() {
    // Ensure builtins are registered before listing names
    if (!builtinsRegistered) {
        registerBuiltinProjections();
        builtinsRegistered = true;
    }
    return Array.from(projections.keys());
}
/**
 * Force registration of all built-in projections.
 *
 * This is called automatically by getProjection(), but can be called
 * explicitly if needed for startup validation or testing.
 */
export function ensureBuiltinProjections() {
    if (!builtinsRegistered) {
        registerBuiltinProjections();
        builtinsRegistered = true;
    }
}
//# sourceMappingURL=registry.js.map