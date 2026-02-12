export interface GuardReport {
    observedPaths: string[];
    forbiddenPaths: string[];
    summary: {
        totalObserved: number;
        totalForbidden: number;
        totalAllowed: number;
    };
}
export declare function buildReport(observedPaths: string[], forbiddenPaths: string[]): GuardReport;
