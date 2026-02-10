export declare function loadAllowlist(patterns: string[]): AllowlistMatcher;
export declare class AllowlistMatcher {
    private patterns;
    constructor(rawPatterns: string[]);
    isAllowed(path: string): boolean;
    filterForbidden(paths: string[]): string[];
}
