/**
 * DevTools API Server
 * 
 * Provides filesystem access for the DevTools UI to scan actual projects.
 * 
 * Usage:
 *   node server.js --port=3001 --manifest-root=/path/to/capsule-pro/modules
 */

import express from 'express';
import cors from 'cors';
import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value;
  return acc;
}, {});

const PORT = parseInt(args.port || '8765', 10);
// Change this to your Capsule-Pro modules directory:
const DEFAULT_MANIFEST_ROOT = process.platform === 'win32' 
  ? 'C:/projects/capsule-pro/packages/manifest-adapters/manifests'  // Windows
  : '/c/projects/capsule-pro/packages/manifest-adapters/manifests'; // Git Bash/WSL
const MANIFEST_ROOT = args['manifest-root'] || DEFAULT_MANIFEST_ROOT;

const app = express();
app.use(cors());
app.use(express.json());

// Windows paths are case-insensitive — normalize for security checks
function isWithinRoot(filePath, root) {
  const resolvedPath = path.resolve(filePath).toLowerCase();
  const resolvedRoot = path.resolve(root).toLowerCase();
  return resolvedPath.startsWith(resolvedRoot);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', manifestRoot: MANIFEST_ROOT });
});

// List all .manifest files
app.get('/api/files', async (req, res) => {
  try {
    const pattern = path.join(MANIFEST_ROOT, '**/*.manifest').replace(/\\/g, '/');
    const files = await glob(pattern, { windowsPathsNoEscape: true });
    res.json({ 
      files: files.map(f => ({
        path: f,
        relative: path.relative(MANIFEST_ROOT, f),
        name: path.basename(f)
      })),
      root: MANIFEST_ROOT
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read a manifest file
app.get('/api/files/:name', async (req, res) => {
  try {
    const filePath = path.join(MANIFEST_ROOT, req.params.name);
    // Security: ensure file is within MANIFEST_ROOT
    if (!isWithinRoot(filePath, MANIFEST_ROOT)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content, path: filePath });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Scan a manifest file using the CLI
app.post('/api/scan', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    // Security check
    if (!isWithinRoot(filePath, MANIFEST_ROOT)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Run the scan command
    const { execSync } = await import('child_process');

    // Use the CLI binary directly from the repo root
    const manifestCli = path.join(__dirname, '../../../packages/cli/bin/manifest.js');
    const manifestRepoRoot = path.resolve(__dirname, '../../../..');
    const output = execSync(`node "${manifestCli}" scan "${filePath}" --format json`, {
      encoding: 'utf-8',
      cwd: manifestRepoRoot,
      env: { ...process.env }
    });

    const result = JSON.parse(output);
    res.json(result);
  } catch (error) {
    // Even if scan fails, return the JSON output
    try {
      const result = JSON.parse(error.stdout || error.message);
      res.json(result);
    } catch {
      res.status(500).json({ error: error.message });
    }
  }
});

// Compile a manifest file and return the IR
app.post('/api/compile', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    // Security check
    if (!isWithinRoot(filePath, MANIFEST_ROOT)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(filePath, 'utf-8');

    // Use the compiler directly (pathToFileURL needed for Windows dynamic imports)
    const compilerPath = path.resolve(__dirname, '../../../dist/manifest/ir-compiler.js');
    const { compileToIR } = await import(pathToFileURL(compilerPath).href);
    const result = await compileToIR(content);

    res.json({
      ir: result.ir || null,
      diagnostics: result.diagnostics || [],
      source: content,
      file: filePath,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compile all manifest files and return combined IR
app.post('/api/compile-all', async (req, res) => {
  try {
    const pattern = path.join(MANIFEST_ROOT, '**/*.manifest').replace(/\\/g, '/');
    const files = await glob(pattern, { windowsPathsNoEscape: true });

    const compilerPath = path.resolve(__dirname, '../../../dist/manifest/ir-compiler.js');
    const { compileToIR } = await import(pathToFileURL(compilerPath).href);

    const results = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = await compileToIR(content);
      results.push({
        file: filePath,
        name: path.basename(filePath),
        ir: result.ir || null,
        diagnostics: result.diagnostics || [],
      });
    }

    res.json({ results, filesCompiled: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scan all files
app.post('/api/scan-all', async (req, res) => {
  try {
    // Run the scan command
    const { execSync } = await import('child_process');

    // Use the CLI binary directly from the repo root
    const manifestCli = path.join(__dirname, '../../../packages/cli/bin/manifest.js');
    const manifestRepoRoot = path.resolve(__dirname, '../../../..');
    const output = execSync(`node "${manifestCli}" scan "${MANIFEST_ROOT}" --format json`, {
      encoding: 'utf-8',
      cwd: manifestRepoRoot,
      env: { ...process.env }
    });

    const result = JSON.parse(output);
    res.json(result);
  } catch (error) {
    try {
      const result = JSON.parse(error.stdout || error.message);
      res.json(result);
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
║  Port:        ${PORT.toString().padEnd(45)}║
║  Manifest:    ${MANIFEST_ROOT.padEnd(45)}║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    GET  /api/health           - Health check             ║
║    GET  /api/files            - List all .manifest files ║
║    GET  /api/files/:name      - Read a specific file     ║
║    POST /api/compile          - Compile file → IR        ║
║    POST /api/compile-all      - Compile all → IR         ║
║    POST /api/scan             - Scan a single file       ║
║    POST /api/scan-all         - Scan all files           ║
╚══════════════════════════════════════════════════════════╝
  `);
});
