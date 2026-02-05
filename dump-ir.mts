import { compileToIR } from './src/manifest/ir-compiler';
import { readFileSync } from 'fs';
const source = readFileSync('./src/manifest/conformance/fixtures/09-compute-action.manifest', 'utf-8');
const { ir, diagnostics } = compileToIR(source);
console.log('Diagnostics:', JSON.stringify(diagnostics, null, 2));
console.log('IR:', JSON.stringify(ir, null, 2));
