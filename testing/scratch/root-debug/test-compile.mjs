import { compileToIR } from './src/manifest/ir-compiler.js';
import { readFileSync, writeFileSync } from 'fs';

async function main() {
  console.error('Starting...');
  try {
    const source = readFileSync('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.manifest', 'utf-8');
    console.error('Source file read, size:', source.length);

    const result = await compileToIR(source);
    console.error('Compilation result keys:', Object.keys(result));
    console.error('Has IR?', !!result.ir);
    console.error('Has diagnostics?', !!result.diagnostics);

    if (result.ir) {
      writeFileSync('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', JSON.stringify(result.ir, null, 2));
      console.error('IR file generated successfully');
    } else {
      console.error('No IR in result!');
      if (result.diagnostics) {
        console.error('Diagnostics:', JSON.stringify(result.diagnostics, null, 2));
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
