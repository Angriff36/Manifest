export interface GuardReport {
  observedPaths: string[];
  forbiddenPaths: string[];
  summary: {
    totalObserved: number;
    totalForbidden: number;
    totalAllowed: number;
  };
}

export function buildReport(observedPaths: string[], forbiddenPaths: string[]): GuardReport {
  return {
    observedPaths,
    forbiddenPaths,
    summary: {
      totalObserved: observedPaths.length,
      totalForbidden: forbiddenPaths.length,
      totalAllowed: observedPaths.length - forbiddenPaths.length,
    },
  };
}
