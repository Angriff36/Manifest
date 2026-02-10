export function buildReport(observedPaths, forbiddenPaths) {
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
