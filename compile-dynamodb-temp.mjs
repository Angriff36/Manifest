import { compileToIR } from './src/manifest/ir-compiler.ts';
import { readFileSync } from 'fs';

const source = readFileSync('./src/manifest/conformance/fixtures/82-dynamodb-store.manifest', 'utf-8');
const result = compileToIR(source);
console.log(JSON.stringify(result.ir, null, 2));
