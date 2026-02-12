import { NextJsProjection } from './src/manifest/projections/nextjs/generator.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

async function main() {
  console.error('Starting CLI-style route generation...');
  try {
    const irPath = '../capsule-pro/packages/kitchen-ops/manifests/prep-task-rules.ir.json';
    const outputDir = '../capsule-pro/apps/api';

    const irContent = readFileSync(irPath, 'utf-8');
    const ir = JSON.parse(irContent);

    console.error('IR loaded, entities:', ir.entities?.length || 0);

    const projection = new NextJsProjection({
      authProvider: 'custom',
      authImportPath: '@repo/auth/server',
      databaseImportPath: '@repo/database',
      runtimeImportPath: '@repo/kitchen-ops',
      responseImportPath: '@repo/kitchen-ops/api-response',
    });

    // Generate route for PrepTask entity
    const result = projection.generate(ir, {
      surface: 'nextjs.route',
      entity: 'PrepTask',
      options: {
        authProvider: 'custom',
        authImportPath: '@repo/auth/server',
        databaseImportPath: '@repo/database',
        runtimeImportPath: '@repo/kitchen-ops',
        responseImportPath: '@repo/kitchen-ops/api-response',
      },
    });

    console.error('Artifacts generated:', result.artifacts?.length || 0);
    console.error('Generated code (first 500 chars):', result.artifacts[0]?.code?.substring(0, 500));

    // Write artifacts
    if (result.artifacts && result.artifacts.length > 0) {
      for (const artifact of result.artifacts) {
        if (!artifact.pathHint) {
          console.error('Artifact has no pathHint, skipping');
          continue;
        }

        const outputPath = resolve(process.cwd(), outputDir, artifact.pathHint);
        console.error('Writing to:', outputPath);
        console.error('Code length:', artifact.code?.length || 0);

        // Create directory if needed
        mkdirSync(dirname(outputPath), { recursive: true });

        // Write file
        writeFileSync(outputPath, artifact.code, 'utf-8');
        console.error('Wrote:', outputPath);
      }
    }

    if (result.diagnostics && result.diagnostics.length > 0) {
      console.error('Diagnostics:', result.diagnostics);
    }

    console.error('Done!');
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  }
}

main();
