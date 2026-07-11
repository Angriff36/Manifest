/**
 * SampleDataRow helpers — sole clear authority for seed packs.
 */

import type { SampleDataRowRecord } from './types.js';
import { SAMPLE_DATA_ROW_ENTITY } from './types.js';

export { SAMPLE_DATA_ROW_ENTITY };

export function buildSampleDataRowId(
  tenantId: string,
  packId: string,
  version: string,
  entity: string,
  seedKey: string,
): string {
  return `${tenantId}:${packId}:${version}:${entity}:${seedKey}`;
}

export function toSampleDataRowRecord(input: {
  tenantId: string;
  packId: string;
  version: string;
  entity: string;
  seedKey: string;
  instanceId: string;
}): SampleDataRowRecord {
  return {
    id: buildSampleDataRowId(
      input.tenantId,
      input.packId,
      input.version,
      input.entity,
      input.seedKey,
    ),
    tenantId: input.tenantId,
    packId: input.packId,
    version: input.version,
    entity: input.entity,
    seedKey: input.seedKey,
    instanceId: input.instanceId,
  };
}

export function matchesPackRun(
  row: SampleDataRowRecord,
  tenantId: string,
  packId?: string,
  version?: string,
): boolean {
  if (row.tenantId !== tenantId) return false;
  if (packId != null && row.packId !== packId) return false;
  if (version != null && row.version !== version) return false;
  return true;
}
