/**
 * Authoritative property-modifier set.
 * Must match PropertyModifier in ir.ts and docs/spec/ir/ir-v1.schema.json.
 */

export const PROPERTY_MODIFIERS = [
  'required',
  'unique',
  'indexed',
  'private',
  'readonly',
  'optional',
  'searchable',
  'encrypted',
  'masked',
] as const;

export type PropertyModifier = (typeof PROPERTY_MODIFIERS)[number];
