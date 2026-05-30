/**
 * GraphQL projection types.
 *
 * Configuration options for the GraphQL SDL + resolver stub projection.
 * Generates type-safe schema definitions with mutations mapped to commands,
 * queries mapped to entity reads, and subscriptions mapped to events.
 */

/**
 * Configuration options for the GraphQL projection.
 */
export interface GraphQLProjectionOptions {
  /**
   * Whether to include auth directives on fields/types that have policies.
   * When true, generates `@auth(requires: ...)` directives.
   * Default: true
   */
  includeAuthDirectives?: boolean;

  /**
   * Whether to generate subscription types from IR events.
   * Default: true
   */
  includeSubscriptions?: boolean;

  /**
   * Whether to include guard descriptions in mutation field descriptions.
   * Default: true
   */
  includeGuardDescriptions?: boolean;

  /**
   * Whether to include constraint info in descriptions.
   * Default: true
   */
  includeConstraintDescriptions?: boolean;

  /**
   * Whether to generate resolver stubs alongside the SDL.
   * Default: true
   */
  includeResolverStubs?: boolean;

  /**
   * Import path for the Manifest runtime (used in resolver stubs).
   * Default: '@/lib/manifest-runtime'
   */
  runtimeImportPath?: string;

  /**
   * Import path for the database client (used in resolver stubs for queries).
   * Default: '@/lib/database'
   */
  databaseImportPath?: string;

  /**
   * Whether to include computed properties in the schema.
   * Default: true
   */
  includeComputedProperties?: boolean;

  /**
   * Custom scalar definitions to include (e.g., DateTime, UUID).
   * Default: auto-detected from IR types
   */
  customScalars?: Record<string, string>;

  /**
   * Whether to generate input types for command parameters.
   * Default: true
   */
  includeInputTypes?: boolean;

  /**
   * Whether to include enum definitions from IR enums.
   * Default: true
   */
  includeEnums?: boolean;
}
