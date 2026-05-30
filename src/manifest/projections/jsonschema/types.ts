/**
 * Configuration options for the JSON Schema projection.
 */
export interface JsonSchemaProjectionOptions {
  /**
   * JSON Schema draft version to emit.
   * - 'draft-07'   → uses `$schema: "http://json-schema.org/draft-07/schema#"`
   * - '2019-09'    → uses `$schema: "https://json-schema.org/draft/2019-09/schema"`
   * - '2020-12'    → uses `$schema: "https://json-schema.org/draft/2020-12/schema"`
   *
   * Default: 'draft-07'
   */
  draft?: 'draft-07' | '2019-09' | '2020-12';

  /**
   * Whether to include computed properties as readOnly fields.
   * Default: true
   */
  includeComputed?: boolean;

  /**
   * Whether to set `additionalProperties: false` on entity schemas.
   * Default: true
   */
  strictAdditionalProperties?: boolean;

  /**
   * Base URI for `$id` references (e.g., "https://example.com/schemas").
   * When set, each schema gets `$id: "<baseUri>/<EntityName>.schema.json"`.
   * Default: undefined (no $id emitted)
   */
  baseUri?: string;
}
