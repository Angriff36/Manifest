/**
 * Env helpers for live Postgres integration tests.
 *
 * - DATABASE_URL: empty Manifest Neon DB (direct / pooler off) — adapter live suites
 * - CAPSULE_TEST_DATABASE_URL: expendable capsule-pro test DB — future cross-app tests
 */

export function postgresLiveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL ?? process.env.MANIFEST_POSTGRES_TEST_URL;
  return url?.trim() || undefined;
}

export function capsuleTestDatabaseUrl(): string | undefined {
  return process.env.CAPSULE_TEST_DATABASE_URL?.trim() || undefined;
}
