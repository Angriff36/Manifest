/**
 * IR Cache for compiled manifest IR
 * Caches by provenance hash to avoid recompilation
 */

export interface IRCacheEntry {
  ir: unknown; // Using unknown to avoid circular import with IR type
  timestamp: number;
  sourceHash: string;
}

export class IRCache {
  private cache: Map<string, IRCacheEntry> = new Map();
  private maxAge: number;
  private maxSize: number;

  constructor(maxAge: number = 3600000, maxSize: number = 100) {
    // maxAge: 1 hour default (in milliseconds)
    // maxSize: maximum number of entries to store
    this.maxAge = maxAge;
    this.maxSize = maxSize;
  }

  /**
   * Get cached IR by content hash
   * Returns null if not found, expired, or if hashes don't match
   */
  get(contentHash: string): unknown | null {
    const entry = this.cache.get(contentHash);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(contentHash);
      return null;
    }

    // Verify the source hash still matches
    if (entry.sourceHash !== contentHash) {
      this.cache.delete(contentHash);
      return null;
    }

    return entry.ir;
  }

  /**
   * Cache compiled IR with content hash as key
   */
  set(contentHash: string, ir: unknown): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(contentHash)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(contentHash, {
      ir,
      timestamp: Date.now(),
      sourceHash: contentHash,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Invalidate a specific cache entry by content hash
   */
  invalidate(contentHash: string): void {
    this.cache.delete(contentHash);
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

/**
 * Global IR cache instance
 */
export const globalIRCache = new IRCache();
