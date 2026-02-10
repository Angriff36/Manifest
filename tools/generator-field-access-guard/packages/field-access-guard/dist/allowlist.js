export function loadAllowlist(patterns) {
    return new AllowlistMatcher(patterns);
}
export class AllowlistMatcher {
    patterns;
    constructor(rawPatterns) {
        this.patterns = rawPatterns.map(p => p.split('.'));
    }
    isAllowed(path) {
        const segments = path.split('.');
        return this.patterns.some(pattern => matchSegments(segments, pattern));
    }
    filterForbidden(paths) {
        return paths.filter(p => !this.isAllowed(p));
    }
}
function matchSegments(pathSegments, patternSegments) {
    if (pathSegments.length !== patternSegments.length) {
        return false;
    }
    for (let i = 0; i < patternSegments.length; i++) {
        if (patternSegments[i] === '*') {
            continue;
        }
        if (patternSegments[i] !== pathSegments[i]) {
            return false;
        }
    }
    return true;
}
