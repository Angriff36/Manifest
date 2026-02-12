import type { ErrorObject } from "ajv";
export interface ValidationError {
    path: string;
    message: string;
    keyword: string;
    params: Record<string, unknown>;
}
export interface FileResult {
    filePath: string;
    valid: boolean;
    errors: ValidationError[];
    parseError?: string;
}
export interface BatchSummary {
    total: number;
    passed: number;
    failed: number;
    results: FileResult[];
}
export interface ValidatorOptions {
    strict: boolean;
}
export interface CliOptions {
    schema: string;
    ir?: string;
    fixtures?: string;
    strict?: boolean;
}
export declare function toValidationError(err: ErrorObject): ValidationError;
//# sourceMappingURL=types.d.ts.map