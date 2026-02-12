import { NextJsProjection } from './src/manifest/projections/nextjs/generator.js';
import { readFileSync } from 'fs';

async function main() {
  console.error('Starting route generation...');
  try {
    const irContent = readFileSync('../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json', 'utf-8');
    const ir = JSON.parse(irContent);

    console.error('IR loaded, entities:', ir.entities?.length || 0);

    const projection = new NextJsProjection({
      authProvider: 'clerk',
      databaseImportPath: '@/lib/database',
      runtimeImportPath: '@repo/kitchen-ops',
      responseImportPath: '@repo/kitchen-ops/api-response',
    });

    // Generate route for PrepTask entity
    const result = projection.generate(ir, {
      surface: 'nextjs.route',
      entity: 'PrepTask',
    });

    console.error('Artifacts generated:', result.artifacts?.length || 0);
    if (result.artifacts && result.artifacts.length > 0) {
      for (const artifact of result.artifacts) {
        console.error('Artifact:', artifact.id, 'pathHint:', artifact.pathHint);
        console.error('Code length:', artifact.code?.length || 0);
      }
    }

    if (result.diagnostics && result.diagnostics.length > 0) {
      console.error('Diagnostics:', result.diagnostics);
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
