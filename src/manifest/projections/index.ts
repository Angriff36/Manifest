/**
 * Projections module entry point.
 *
 * Projections consume IR and emit platform-specific code.
 * They are NOT part of runtime semantics.
 *
 * The registry auto-registers builtins on first access, so consumers
 * can simply call getProjection(name) without manual initialization.
 *
 * See docs/patterns/external-projections.md for detailed rationale.
 */

export * from './interface.js';
export * from './registry.js';

// Re-export built-in projections for convenience
export { NextJsProjection } from './nextjs/generator.js';
export { registerBuiltinProjections, listBuiltinProjections } from './builtins.js';
