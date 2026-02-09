export function loadAllowlist(patterns: string[]): AllowlistMatcher {
  return new AllowlistMatcher(patterns);
}

export class AllowlistMatcher {
  private patterns: string[][];

  constructor(rawPatterns: string[]) {
    this.patterns = rawPatterns.map(p => p.split('.'));
  }

  isAllowed(path: string): boolean {
    const segments = path.split('.');
    return this.patterns.some(pattern => matchSegments(segments, pattern));
  }

  filterForbidden(paths: string[]): string[] {
    return paths.filter(p => !this.isAllowed(p));
  }
}

function matchSegments(pathSegments: string[], patternSegments: string[]): boolean {
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
