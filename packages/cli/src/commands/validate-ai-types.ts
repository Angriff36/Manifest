import type { IRTenant } from '@angriff36/manifest/ir';

export interface ValidationDiagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'schema' | 'compile' | 'semantic' | 'structural' | 'domain';
  path?: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationReport {
  file: string;
  inputType: 'manifest-source' | 'ir-json';
  valid: boolean;
  score: number;
  diagnostics: ValidationDiagnostic[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    totalChecks: number;
  };
}

export interface ValidateAIOptions {
  format?: 'text' | 'json';
  schema?: string;
  minScore?: number;
  verbose?: boolean;
}

export type IrRecord = Record<string, unknown>;

export interface ParsedIrSnapshot {
  entities: IrRecord[];
  commands: IrRecord[];
  policies: IrRecord[];
  stores: IrRecord[];
  events: IrRecord[];
  reactions: IrRecord[];
  tenant: IRTenant | undefined;
}
