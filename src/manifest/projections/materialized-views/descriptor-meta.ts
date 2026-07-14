import type { ProjectionDescriptorMeta } from '../descriptor-types.js';
import {
  configurationSurface,
  optionalOption,
  requiredOption,
} from '../descriptor-helpers.js';
import { MATERIALIZED_VIEWS_PROJECTION_DEFAULTS } from './options.js';

export const MATERIALIZED_VIEWS_DESCRIPTOR_META: ProjectionDescriptorMeta = {
  displayName: 'Materialized Views',
  surfaces: [configurationSurface('materialized-views.ddl')],
  options: [
    requiredOption('views', 'array', {
      description:
        'Materialized view definitions (name, source entity/read-model, columns, refresh).',
    }),
    optionalOption('emitSingleFile', 'boolean', {
      default: MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.emitSingleFile,
    }),
    optionalOption('output', 'string', { default: MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.output }),
    optionalOption('schema', 'string'),
    optionalOption('emitRefreshStatements', 'boolean', {
      default: MATERIALIZED_VIEWS_PROJECTION_DEFAULTS.emitRefreshStatements,
    }),
  ],
  prerequisites: [
    {
      kind: 'configured-views',
      description: 'options.views must be non-empty or generate returns NO_VIEWS_DECLARED.',
      required: true,
    },
  ],
  artifactCategories: ['ddl', 'sql'],
  packageDependencies: [],
  runtimeDependencies: ['postgresql'],
  compatibleCompanions: [],
  incompatibleWith: [],
  resolved: true,
};
