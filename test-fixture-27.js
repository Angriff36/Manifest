import { compileToIR } from './src/manifest/ir-compiler.js';
import { readFileSync } from 'fs';

const source = readFileSync('src/manifest/conformance/fixtures/27-vnext-integration.manifest', 'utf-8');

async function test() {
  const result = await compileToIR(source);

  console.log('IR:', result.ir);
  console.log('\nDiagnostics:');
  result.diagnostics.forEach(d => {
    console.log(`  [${d.severity}] Line ${d.line}:${d.column} - ${d.message}`);
  });
}

test().catch(console.error);
