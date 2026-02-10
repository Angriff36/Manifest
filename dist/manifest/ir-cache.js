/**
 * IR Cache for compiled manifest IR
 * Caches by provenance hash to avoid recompilation
 */
export class IRCache {
    cache = new Map();
    maxAge;
    maxSize;
    constructor(maxAge = 3600000, maxSize = 100) {
        // maxAge: 1 hour default (in milliseconds)
        // maxSize: maximum number of entries to store
        this.maxAge = maxAge;
        this.maxSize = maxSize;
    }
    /**
     * Get cached IR by content hash
     * Returns null if not found, expired, or if hashes don't match
     */
    get(contentHash) {
        const entry = this.cache.get(contentHash);
        if (!entry)
            return null;
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
    set(contentHash, ir) {
        // Evict oldest entry if cache is full
        if (this.cache.size >= this.maxSize && !this.cache.has(contentHash)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey)
                this.cache.delete(firstKey);
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
    clear() {
        this.cache.clear();
    }
    /**
     * Invalidate a specific cache entry by content hash
     */
    invalidate(contentHash) {
        this.cache.delete(contentHash);
    }
    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        };
    }
    /**
     * Clean up expired entries
     */
    cleanup() {
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
//# sourceMappingURL=ir-cache.js.map