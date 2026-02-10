/**
 * manifest validate command
 *
 * Validates IR against the schema.
 */
interface ValidateOptions {
    schema?: string;
    strict: boolean;
}
/**
 * Validate command handler
 */
export declare function validateCommand(ir: string | undefined, options: ValidateOptions): Promise<void>;
export {};
//# sourceMappingURL=validate.d.ts.map