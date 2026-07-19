/**
 * Emit integration-guard configuration from a capability catalog + app seams.
 */

import { COMPILER_VERSION } from '../version.js';
import type { CapabilityCatalog, IntegrationGuardConfig, ProofKitVersions } from './types.js';
import { GUARD_CONFIG_SCHEMA } from './types.js';

export interface EmitGuardConfigOptions {
  featureRoots: string[];
  convexLibRoot?: string;
  versions?: Partial<ProofKitVersions>;
  lifecycleLiteralPattern?: string;
  lifecyclePolicies?: IntegrationGuardConfig['lifecyclePolicies'];
  exceptions?: IntegrationGuardConfig['exceptions'];
  forbidDirectConvexHooks?: boolean;
  /** Extra tables beyond catalog entities (usually empty). */
  extraOwnedTables?: string[];
}

const DEFAULT_FORBIDDEN_IMPORTS = [
  '(?:^|/)convex/(?:queries|mutations)(?:\\.|$|/)',
  '(?:^|/)convex/_generated(?:/|$)',
  '^convex/react$',
];

/** Build guard config; owned tables come from catalog entity.table values. */
export function emitIntegrationGuardConfig(
  catalog: CapabilityCatalog,
  options: EmitGuardConfigOptions,
): IntegrationGuardConfig {
  const versions: ProofKitVersions = {
    manifestVersion:
      options.versions?.manifestVersion ?? catalog.versions.manifestVersion ?? COMPILER_VERSION,
    projection: options.versions?.projection ?? catalog.versions.projection,
    ...((options.versions?.preset ?? catalog.versions.preset)
      ? { preset: options.versions?.preset ?? catalog.versions.preset }
      : {}),
  };

  const ownedTables = [
    ...new Set([...catalog.entities.map((e) => e.table), ...(options.extraOwnedTables ?? [])]),
  ].sort();

  return {
    schemaVersion: GUARD_CONFIG_SCHEMA,
    versions,
    featureRoots: [...options.featureRoots].sort(),
    convexLibRoot: options.convexLibRoot ?? 'convex/lib',
    ownedTables,
    forbidDirectConvexHooks: options.forbidDirectConvexHooks ?? true,
    forbiddenImportPatterns: [...DEFAULT_FORBIDDEN_IMPORTS],
    ...(options.lifecycleLiteralPattern
      ? { lifecycleLiteralPattern: options.lifecycleLiteralPattern }
      : {}),
    lifecyclePolicies: options.lifecyclePolicies ?? [],
    exceptions: options.exceptions ?? [],
  };
}
