import type { BatchSummary, FileResult, ValidatorOptions } from "./types.js";
export declare function loadSchema(schemaPath: string): Promise<unknown>;
export declare function validateFile(schemaData: unknown, filePath: string, options: ValidatorOptions): Promise<FileResult>;
export declare function validateDirectory(schemaData: unknown, dirPath: string, options: ValidatorOptions): Promise<BatchSummary>;
//# sourceMappingURL=validator.d.ts.map