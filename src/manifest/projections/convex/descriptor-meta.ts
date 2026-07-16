import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import { aggregateSurface, optionalOption } from '../descriptor-helpers.js';
import { CONVEX_PROJECTION_DEFAULTS } from './options.js';

const SURFACES = [
  'convex.schema',
  'convex.queries',
  'convex.mutations',
  'convex.crons',
  'convex.http',
  'convex.sagas',
  'convex.computed',
  'convex.react',
] as const;

/** Convex is aggregate: generate() never requires request.entity/command. */
export const CONVEX_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Convex',
  surfaces: SURFACES.map((id) => aggregateSurface(id)),
  options: [
    optionalOption('output', 'string', { default: CONVEX_PROJECTION_DEFAULTS.output }),
    optionalOption('tableMappings', 'record'),
    optionalOption('typeMappings', 'record'),
    optionalOption('indexes', 'record'),
    optionalOption('references', 'record'),
    optionalOption('referenceMode', 'enum', {
      default: CONVEX_PROJECTION_DEFAULTS.referenceMode,
      enumValues: ['convexId', 'stringId'],
    }),
    optionalOption('naming', 'object'),
    optionalOption('emitEventsTable', 'boolean', {
      default: CONVEX_PROJECTION_DEFAULTS.emitEventsTable,
    }),
    optionalOption('eventsTable', 'string', { default: CONVEX_PROJECTION_DEFAULTS.eventsTable }),
    optionalOption('idempotencyTable', 'string', {
      default: CONVEX_PROJECTION_DEFAULTS.idempotencyTable,
    }),
    optionalOption('policyMode', 'enum', {
      default: CONVEX_PROJECTION_DEFAULTS.policyMode,
      enumValues: ['enforce', 'skip'],
    }),
    optionalOption('authContextImport', 'string'),
    optionalOption('encryptionImport', 'string'),
    optionalOption('includeTenantFilter', 'boolean', {
      default: CONVEX_PROJECTION_DEFAULTS.includeTenantFilter,
    }),
    optionalOption('includeSoftDeleteFilter', 'boolean', {
      default: CONVEX_PROJECTION_DEFAULTS.includeSoftDeleteFilter,
    }),
    optionalOption('tenantIdProperty', 'string'),
    optionalOption('deletedAtProperty', 'string', {
      default: CONVEX_PROJECTION_DEFAULTS.deletedAtProperty,
    }),
    optionalOption('computedProperties', 'enum', {
      default: CONVEX_PROJECTION_DEFAULTS.computedProperties,
      enumValues: ['helpers', 'inline'],
    }),
    optionalOption('apiImportPath', 'string', {
      // When omitted, derived from client pathHint → convex/_generated/api.
      // Default below is that derivation for the Builder preset client path.
      default: '../../convex/_generated/api',
    }),
  ],
  prerequisites: [
    {
      kind: 'schedules',
      description: 'IR schedules drive convex.crons emission; empty schedules yield empty crons.',
      required: false,
      surfaces: ['convex.crons'],
    },
    {
      kind: 'webhooks',
      description: 'IR webhooks drive convex.http routes; empty webhooks yield empty http.',
      required: false,
      surfaces: ['convex.http'],
    },
  ],
  artifactCategories: ['schema', 'queries', 'mutations', 'orchestration', 'computed', 'client'],
  packageDependencies: ['convex'],
  runtimeDependencies: [],
  // Evidence: Capsule-V2 / Builder Convex app preset pairs these in one workflow.
  // zod: type-parity proven in convex/zod-parity.test.ts (shared IR scalars → both projections).
  // contract-tests: emits Vitest suites against convex.queries / convex.mutations.
  compatibleCompanions: ['wiring', 'llm-context', 'mermaid', 'zod', 'contract-tests'],
  incompatibleWith: [],
  resolved: true,
};
