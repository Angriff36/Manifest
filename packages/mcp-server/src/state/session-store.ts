/**
 * In-process session store for compiled IR and RuntimeEngine instances.
 *
 * The MCP server is a long-lived stdio process managed by the host (e.g. Claude
 * Desktop). This store caches compiled IR keyed by content hash so that the
 * execute and explain tools can reference a prior compile result.
 *
 * No cross-process persistence — when the server process restarts, all cached
 * IR is lost. Re-compilation is cheap (sub-millisecond for typical manifests).
 */

import type { IR } from '@angriff36/manifest/ir';
import { RuntimeEngine, type RuntimeContext, type RuntimeOptions } from '@angriff36/manifest';

export interface CacheEntry {
  ir: IR;
  contentHash: string;
  engine: RuntimeEngine;
  createdAt: number;
}

class SessionStore {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize = 50;

  /**
   * Store compiled IR and create a pre-warmed RuntimeEngine for it.
   * Uses FIFO eviction when the cache exceeds maxSize.
   */
  store(
    contentHash: string,
    ir: IR,
    context: RuntimeContext = {},
    options: RuntimeOptions = {},
  ): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(contentHash)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    const engine = new RuntimeEngine(ir, context, {
      ...options,
      requireValidProvenance: false,
    });

    this.cache.set(contentHash, {
      ir,
      contentHash,
      engine,
      createdAt: Date.now(),
    });
  }

  get(contentHash: string): CacheEntry | undefined {
    return this.cache.get(contentHash);
  }

  getEngine(contentHash: string): RuntimeEngine | undefined {
    return this.cache.get(contentHash)?.engine;
  }

  getIR(contentHash: string): IR | undefined {
    return this.cache.get(contentHash)?.ir;
  }

  list(): Array<{ contentHash: string; createdAt: number }> {
    return Array.from(this.cache.values()).map((e) => ({
      contentHash: e.contentHash,
      createdAt: e.createdAt,
    }));
  }

  clear(): void {
    this.cache.clear();
  }
}

/** Singleton session store for the MCP server process lifetime. */
export const sessionStore = new SessionStore();
