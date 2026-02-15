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

// Configuration - CHANGE THESE PATHS FOR YOUR SETUP
const PORT = 8765;
const CAPSULE_PRO_ROOT = 'C:/projects/capsule-pro';
const MANIFEST_REPO_ROOT = 'C:/projects/manifest';
const MANIFEST_SOURCE_DIR = path.join(CAPSULE_PRO_ROOT, 'packages/manifest-adapters/manifests');

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
  const manifestCli = path.join(MANIFEST_REPO_ROOT, 'packages/cli/bin/manifest.js');
  
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
    `"${process.execPath}" "${manifestCli}" scan "${targetPath}" --format json`,
    {
      encoding: 'utf-8',
      cwd: MANIFEST_REPO_ROOT,
      env,
      windowsHide: true,
    }
  );

  return JSON.parse(output);
}

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
║  Manifest DevTools API Server                            ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                         ║
║  Manifest:    ${MANIFEST_SOURCE_DIR}  ║
║  Capsule-Pro: ${CAPSULE_PRO_ROOT}                    ║
╠══════════════════════════════════════════════════════════╣
║  Ready to scan your Capsule-Pro manifest files!          ║
╚══════════════════════════════════════════════════════════╝
  `);
});
