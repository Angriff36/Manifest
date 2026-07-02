/**
 * MemoryIdempotencyStore — first-party in-memory implementation of the
 * IdempotencyStore contract (src/manifest/runtime-engine.ts).
 *
 * Intended use:
 *   - Unit and conformance tests
 *   - Local development and sample applications
 *   - Reference for downstream durable implementations
 *
 * Durability: none. State lives in process memory only.
 *
 * First-write-wins: `set` on a key that already has a cached result is a
 * no-op — the first recorded result wins. This mirrors the durable
 * PostgresIdempotencyStore (INSERT … ON CONFLICT (key) DO NOTHING) so both
 * adapters behave identically under a replay. In normal runtime operation
 * the engine only calls `set` after a `get` miss, so the two policies are
 * indistinguishable there; the choice matters only for racing writers.
 */

import type { CommandResult, IdempotencyStore } from '../../runtime-engine';

export class MemoryIdempotencyStore implements IdempotencyStore {
  private cache: Map<string, CommandResult> = new Map();

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async get(key: string): Promise<CommandResult | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, result: CommandResult): Promise<void> {
    if (this.cache.has(key)) {
      return;
    }
    this.cache.set(key, result);
  }

  /** Number of cached keys. Not part of the contract — for tests/observability. */
  size(): number {
    return this.cache.size;
  }

  /** Drop all cached results. Not part of the contract — for tests. */
  clear(): void {
    this.cache.clear();
  }
}
