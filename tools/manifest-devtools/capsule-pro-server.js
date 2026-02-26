/**
 * DevTools API Server - Standalone version for Capsule-Pro
 * 
 * Copy this file to your Capsule-Pro root and run: node server.js
 */

import express from 'express';
import cors from 'cors';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration - Can be overridden via environment variables or command line args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value;
  return acc;
}, {});

const PORT = parseInt(process.env.PORT || args.port || '8765', 10);
const CAPSULE_PRO_ROOT = process.env.CAPSULE_PRO_ROOT || args['capsule-root'] || 'C:/projects/capsule-pro';
const MANIFEST_REPO_ROOT = process.env.MANIFEST_REPO_ROOT || args['manifest-repo'] || 'C:/projects/manifest';
const MANIFEST_SOURCE_DIR = process.env.MANIFEST_SOURCE_DIR || args['manifest-dir'] || path.join(CAPSULE_PRO_ROOT, 'packages/manifest-adapters/manifests');

// CLI path (can be overridden)
const CLI_PATH = process.env.CLI_PATH || args['cli-path'] || path.join(MANIFEST_REPO_ROOT, 'packages/cli/bin/manifest.js');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', manifestRoot: MANIFEST_SOURCE_DIR });
});

// List all .manifest files
app.get('/api/files', async (req, res) => {
  try {
    const pattern = path.join(MANIFEST_SOURCE_DIR, '**/*.manifest');
    const files = await glob(pattern);
    res.json({ 
      files: files.map(f => ({
        path: f,
        relative: path.relative(MANIFEST_SOURCE_DIR, f),
        name: path.basename(f)
      })),
      root: MANIFEST_SOURCE_DIR
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read a manifest file
app.get('/api/files/:name', async (req, res) => {
  try {
    const filePath = path.join(MANIFEST_SOURCE_DIR, req.params.name);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Helper to run scan with proper module resolution
function runScan(targetPath) {
  // Set up proper module resolution paths
  const nodePaths = [
    path.join(MANIFEST_REPO_ROOT, 'node_modules'),
    path.join(MANIFEST_REPO_ROOT, 'packages/cli/node_modules'),
  ].join(path.delimiter);

  const env = {
    ...process.env,
    NODE_PATH: nodePaths,
  };

  const output = execSync(
    `"${process.execPath}" "${CLI_PATH}" scan "${targetPath}" --format json`,
    {
      encoding: 'utf-8',
      cwd: MANIFEST_REPO_ROOT,
      env,
      windowsHide: true,
    }
  );

  return JSON.parse(output);
}

// Generate canonical route surface from all compiled IR
app.post('/api/routes', async (req, res) => {
  try {
    const pattern = path.join(MANIFEST_SOURCE_DIR, '**/*.manifest');
    const files = await glob(pattern);

    const { pathToFileURL } = await import('url');
    const compilerPath = path.resolve(MANIFEST_REPO_ROOT, 'dist/manifest/ir-compiler.js');
    const { compileToIR } = await import(pathToFileURL(compilerPath).href);

    const projectionPath = path.resolve(MANIFEST_REPO_ROOT, 'dist/manifest/projections/routes/generator.js');
    const { RoutesProjection } = await import(pathToFileURL(projectionPath).href);

    const projection = new RoutesProjection();
    const basePath = req.body?.basePath || '/api';
    const allRoutes = [];
    const allDiagnostics = [];
    let filesCompiled = 0;

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = await compileToIR(content);

      if (!result.ir) {
        allDiagnostics.push({
          file: path.relative(MANIFEST_SOURCE_DIR, filePath),
          severity: 'error',
          message: 'Compilation failed',
        });
        continue;
      }

      filesCompiled++;

      const routeResult = projection.generate(result.ir, {
        surface: 'routes.manifest',
        options: { basePath, generatedAt: new Date().toISOString() },
      });

      if (routeResult.artifacts.length > 0) {
        const manifest = JSON.parse(routeResult.artifacts[0].code);
        allRoutes.push(...manifest.routes);
      }

      for (const d of routeResult.diagnostics) {
        allDiagnostics.push({ file: path.relative(MANIFEST_SOURCE_DIR, filePath), ...d });
      }
    }

    res.json({
      $schema: 'https://manifest.lang/spec/routes-v1.schema.json',
      version: '1.0',
      generatedAt: new Date().toISOString(),
      basePath,
      filesCompiled,
      routes: allRoutes,
      diagnostics: allDiagnostics,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scan a single file
app.post('/api/scan', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const result = runScan(filePath);
    res.json(result);
  } catch (error) {
    try {
      // Try to parse error output as JSON
      const result = JSON.parse(error.stdout || '{}');
      if (result.errors || result.warnings) {
        res.json(result);
      } else {
        res.status(500).json({ 
          errors: [{
            file: req.body.filePath || 'unknown',
            message: error.message,
            suggestion: 'Check that manifest files exist and are valid'
          }],
          warnings: [],
          filesScanned: 0,
          commandsChecked: 0,
          routesScanned: 0
        });
      }
    } catch {
      res.status(500).json({ error: error.message });
    }
  }
});

// Scan all files
app.post('/api/scan-all', async (req, res) => {
  try {
    const result = runScan(MANIFEST_SOURCE_DIR);
    res.json(result);
  } catch (error) {
    try {
      const result = JSON.parse(error.stdout || '{}');
      if (result.errors || result.warnings) {
        res.json(result);
      } else {
        throw error;
      }
    } catch {
      res.status(500).json({ error: error.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Manifest DevTools API Server (Capsule-Pro)              ║
╠══════════════════════════════════════════════════════════╣
║  Port:             ${PORT}                                    ║
║  Manifest Source:  ${MANIFEST_SOURCE_DIR.padEnd(40)} ║
║  Capsule-Pro Root: ${CAPSULE_PRO_ROOT.padEnd(40)} ║
║  Manifest Repo:    ${MANIFEST_REPO_ROOT.padEnd(40)} ║
║  CLI Path:         ${CLI_PATH.padEnd(40)} ║
╠══════════════════════════════════════════════════════════╣
║  Configuration via environment variables:                 ║
║    PORT, CAPSULE_PRO_ROOT, MANIFEST_REPO_ROOT,           ║
║    MANIFEST_SOURCE_DIR, CLI_PATH                         ║
║                                                           ║
║  Or command line args:                                    ║
║    --port=8765 --capsule-root=/path --manifest-repo=/path║
║    --manifest-dir=/path --cli-path=/path                 ║
╠══════════════════════════════════════════════════════════╣
║  Ready to scan your Capsule-Pro manifest files!          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
