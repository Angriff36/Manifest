import { NextJsProjection } from './src/manifest/projections/nextjs/generator.js';
import { readFileSync } from 'fs';
import path from 'path';

async function main() {
  console.error('Debugging path generation...');
  try {
    const irPath = '../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json';
    const outputDir = '../capsule-pro/apps/api';

    const irContent = readFileSync(irPath, 'utf-8');
    const ir = JSON.parse(irContent);

    const projection = new NextJsProjection({
      authProvider: 'clerk',
      databaseImportPath: '@/lib/database',
      runtimeImportPath: '@repo/kitchen-ops',
      responseImportPath: '@repo/kitchen-ops/api-response',
    });

    const result = projection.generate(ir, {
      surface: 'nextjs.route',
      entity: 'PrepTask',
    });

    console.error('Artifacts generated:', result.artifacts?.length || 0);

    if (result.artifacts && result.artifacts.length > 0) {
      for (const artifact of result.artifacts) {
        console.error('Artifact ID:', artifact.id);
        console.error('pathHint:', artifact.pathHint);

        // Simulate CLI path resolution
        const outputPath = path.resolve(outputDir, artifact.pathHint);
        console.error('Resolved path:', outputPath);

        const relativePath = path.relative(process.cwd(), outputPath);
        console.error('Relative path:', relativePath);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
