/**
 * IR Cache for compiled manifest IR
 * Caches by provenance hash to avoid recompilation
 */
export interface IRCacheEntry {
    ir: unknown;
    timestamp: number;
    sourceHash: string;
}
export declare class IRCache {
    private cache;
    private maxAge;
    private maxSize;
    constructor(maxAge?: number, maxSize?: number);
    /**
     * Get cached IR by content hash
     * Returns null if not found, expired, or if hashes don't match
     */
    get(contentHash: string): unknown | null;
    /**
     * Cache compiled IR with content hash as key
     */
    set(contentHash: string, ir: unknown): void;
    /**
     * Clear all cached entries
     */
    clear(): void;
    /**
     * Invalidate a specific cache entry by content hash
     */
    invalidate(contentHash: string): void;
    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        keys: string[];
    };
    /**
     * Clean up expired entries
     */
    cleanup(): number;
}
/**
 * Global IR cache instance
 */
export declare const globalIRCache: IRCache;
//# sourceMappingURL=ir-cache.d.ts.map