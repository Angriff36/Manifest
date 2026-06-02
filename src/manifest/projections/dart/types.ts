/**
 * Options for the Dart/Flutter projection.
 */

/** State management style for generated code. */
export type DartStateManagement = 'riverpod' | 'provider' | 'none';

/**
 * Configuration for Dart code generation.
 */
export interface DartProjectionOptions {
  /** State management style (default: 'riverpod') */
  stateManagement?: DartStateManagement;

  /** Base URL for the generated HTTP client (default: 'http://localhost:3000') */
  clientBaseUrl?: string;

  /** Name of the generated client class (default: 'ManifestClient') */
  clientClassName?: string;

  /** Whether to emit computed property getters (default: true) */
  emitComputedProperties?: boolean;

  /** Whether to emit validator methods for constraints (default: true) */
  emitValidators?: boolean;

  /** Whether to emit equality and copyWith methods (default: true) */
  emitEquality?: boolean;

  /** Whether to emit a complete package (pubspec.yaml, README) (default: false) */
  emitPackageFiles?: boolean;

  /** Package name for pubspec.yaml (default: 'manifest_client') */
  packageName?: string;

  /** Whether to emit a header comment with generation timestamp (default: true) */
  emitHeader?: boolean;
}
