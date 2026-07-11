/**
 * Mock-based unit tests for PostgresApprovalStore.
 *
 * No live database is required. We verify the adapter issues the expected
 * SQL (upsert on conflict, set-based expire … RETURNING) and round-trips
 * rows through a stubbed `pg`-shaped pool. Live integration testing is out
 * of scope until the repo grows DB infra (see postgres.live.test.ts in the
 * outbox/audit families for the gated pattern).
 */

import { describe, it, expect } from 'vitest';
import { PostgresApprovalStore } from './postgres';
import type { ApprovalRequestState } from '../../runtime-engine';
import type { Pool, QueryResult } from 'pg';

type Query = { sql: string; params: unknown[] };

function makeFakePool(rowsToReturn: unknown[] = []): { pool: Pool; queries: Query[] } {
  const queries: Query[] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      queries.push({ sql, params });
      return { rows: rowsToReturn } as QueryResult;
    },
  } as unknown as Pool;
  return { pool, queries };
}

function state(overrides: Partial<ApprovalRequestState> = {}): ApprovalRequestState {
  return {
    entity: 'PurchaseOrder',
    instanceId: 'po-1',
    approvalName: 'submitApproval',
    command: 'submit',
    status: 'pending',
    requiredStages: ['manager'],
    grants: [],
    requestedAt: 1000,
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    request_key: 'PurchaseOrder:po-1:submitApproval',
    entity: 'PurchaseOrder',
    instance_id: 'po-1',
    approval_name: 'submitApproval',
    command: 'submit',
    status: 'pending',
    required_stages: ['manager'],
    grants: [],
    requested_at: 1000,
    expires_at: null,
    denied_by: null,
    denied_reason: null,
    ...overrides,
  };
}

describe('PostgresApprovalStore — save', () => {
  it('issues an upsert keyed on request_key', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresApprovalStore({ pool });
    await store.save('k1', state());
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO "manifest_approval_requests"');
    expect(queries[0].sql).toContain('ON CONFLICT (request_key) DO UPDATE');
    expect(queries[0].params[0]).toBe('k1');
  });

  it('serializes required_stages and grants as JSON', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresApprovalStore({ pool });
    await store.save(
      'k1',
      state({
        requiredStages: ['manager', 'director'],
        grants: [{ stage: 'manager', by: 'alice', at: 5 }],
      }),
    );
    expect(queries[0].params[6]).toBe(JSON.stringify(['manager', 'director']));
    expect(queries[0].params[7]).toBe(JSON.stringify([{ stage: 'manager', by: 'alice', at: 5 }]));
  });

  it('passes null for an absent expiresAt', async () => {
    const { pool, queries } = makeFakePool();
    const store = new PostgresApprovalStore({ pool });
    await store.save('k1', state({ expiresAt: undefined }));
    expect(queries[0].params[9]).toBeNull();
  });
});

describe('PostgresApprovalStore — load', () => {
  it('returns undefined when no row matches', async () => {
    const { pool } = makeFakePool([]);
    const store = new PostgresApprovalStore({ pool });
    expect(await store.load('missing')).toBeUndefined();
  });

  it('maps a row back to ApprovalRequestState', async () => {
    const { pool } = makeFakePool([
      row({
        expires_at: 9000,
        grants: [{ stage: 'manager', by: 'alice', at: 5 }],
      }),
    ]);
    const store = new PostgresApprovalStore({ pool });
    const loaded = await store.load('PurchaseOrder:po-1:submitApproval');
    expect(loaded).toBeDefined();
    expect(loaded!.instanceId).toBe('po-1');
    expect(loaded!.expiresAt).toBe(9000);
    expect(loaded!.grants).toEqual([{ stage: 'manager', by: 'alice', at: 5 }]);
  });

  it('coerces bigint string columns to numbers', async () => {
    const { pool } = makeFakePool([row({ requested_at: '1000', expires_at: '9000' })]);
    const store = new PostgresApprovalStore({ pool });
    const loaded = await store.load('k');
    expect(loaded!.requestedAt).toBe(1000);
    expect(loaded!.expiresAt).toBe(9000);
  });
});

describe('PostgresApprovalStore — expire', () => {
  it('issues a set-based UPDATE … RETURNING gated on pending + expires_at', async () => {
    const { pool, queries } = makeFakePool([row({ status: 'expired', expires_at: 500 })]);
    const store = new PostgresApprovalStore({ pool });
    const expired = await store.expire(1000);
    expect(queries[0].sql).toContain('UPDATE "manifest_approval_requests"');
    expect(queries[0].sql).toContain("status = 'expired'");
    expect(queries[0].sql).toContain('RETURNING');
    expect(queries[0].params[0]).toBe(1000);
    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe('expired');
  });
});
