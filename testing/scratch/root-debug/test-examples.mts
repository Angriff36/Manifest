import { compileToIR } from './src/manifest/ir-compiler';
import { examples } from './src/manifest/examples';

for (const ex of examples) {
  const { ir, diagnostics } = compileToIR(ex.code);
  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    console.log(`FAIL: ${ex.name}`);
    errors.forEach(e => console.log(`  - ${e.message} at line ${e.line}`));
  } else {
    console.log(`PASS: ${ex.name}`);
  }
}
