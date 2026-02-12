import { Parser } from './parser.js';
import { CodeGenerator } from './generator.js';
export class ManifestCompiler {
    parser = new Parser();
    generator = new CodeGenerator();
    compile(source) {
        const { program, errors } = this.parser.parse(source);
        if (errors.length > 0)
            return { success: false, errors, ast: program };
        try {
            const { code, serverCode, testCode } = this.generator.generate(program);
            return { success: true, code, serverCode, testCode, ast: program, errors: [] };
        }
        catch (e) {
            return { success: false, errors: [{ message: e instanceof Error ? e.message : 'Generation failed', severity: 'error' }], ast: program };
        }
    }
    parse(source) {
        return this.parser.parse(source);
    }
}
export * from './types.js';
//# sourceMappingURL=compiler.js.map