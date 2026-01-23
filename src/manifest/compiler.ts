import { Parser } from './parser';
import { CodeGenerator } from './generator';
import { CompilationResult, ManifestProgram } from './types';

export class ManifestCompiler {
  private parser = new Parser();
  private generator = new CodeGenerator();

  compile(source: string): CompilationResult {
    const { program, errors } = this.parser.parse(source);
    if (errors.length > 0) return { success: false, errors, ast: program };
    try {
      const { code, serverCode, testCode } = this.generator.generate(program);
      return { success: true, code, serverCode, testCode, ast: program, errors: [] };
    } catch (e) {
      return { success: false, errors: [{ message: e instanceof Error ? e.message : 'Generation failed', severity: 'error' }], ast: program };
    }
  }

  parse(source: string): { program: ManifestProgram; errors: any[] } {
    return this.parser.parse(source);
  }
}

export * from './types';
