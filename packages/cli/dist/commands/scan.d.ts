/**
 * manifest scan command
 *
 * Scans .manifest files for configuration issues before runtime.
 * Primary goal: "If scan passes, the code works."
 *
 * Checks performed:
 * - Policy coverage: Every command has a policy
 * - Store consistency: Store targets are recognized
 * - Route context: Generated routes pass required user context
 * - (Future) Property alignment: Manifest properties match store schema
 */
interface ScanOptions {
    glob?: string;
    format?: 'text' | 'json';
    strict?: boolean;
}
/**
 * Scan command handler
 */
export declare function scanCommand(source: string | undefined, options?: ScanOptions): Promise<void>;
export {};
//# sourceMappingURL=scan.d.ts.map