export interface TraceResult {
    observedPaths: string[];
}
export declare function createTracedProxy<T extends object>(target: T): {
    proxy: T;
    getResult: () => TraceResult;
};
