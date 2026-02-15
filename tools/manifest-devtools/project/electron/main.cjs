const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Manifest repo root: 4 levels up from electron/ inside tools/manifest-devtools/project/electron/ */
const MANIFEST_ROOT = path.resolve(__dirname, '../../../..');

/** Compiler entry (ESM) — resolved from repo root */
const COMPILER_PATH = path.join(MANIFEST_ROOT, 'dist', 'manifest', 'ir-compiler.js');

/** CLI entry */
const CLI_PATH = path.join(MANIFEST_ROOT, 'packages', 'cli', 'bin', 'manifest.js');

/** Persistent settings file stored in Electron's userData directory */
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(data) {
  const current = loadSettings();
  const merged = { ...current, ...data };
  fs.writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// ---------------------------------------------------------------------------
// File discovery — recursive walk (no external glob dependency)
// ---------------------------------------------------------------------------

/**
 * Recursively find all files matching a given extension under `root`.
 * Uses fs.readdirSync with { recursive: true } (Node >= 18.17).
 */
function findManifestFiles(root) {
  const results = [];
  try {
    const entries = fs.readdirSync(root, { recursive: true, withFileTypes: false });
    for (const entry of entries) {
      // entry is a relative path string when recursive: true and withFileTypes: false
      const rel = typeof entry === 'string' ? entry : String(entry);
      if (rel.endsWith('.manifest')) {
        const absolute = path.join(root, rel);
        // Normalise to forward slashes for consistency
        const relative = rel.replace(/\\/g, '/');
        const name = path.basename(rel);
        results.push({ path: absolute, relative, name });
      }
    }
  } catch (err) {
    console.error('findManifestFiles error:', err.message);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Compiler helper — dynamic ESM import
// ---------------------------------------------------------------------------

let _compilerPromise = null;

function getCompiler() {
  if (!_compilerPromise) {
    _compilerPromise = import(pathToFileURL(COMPILER_PATH).href).then((mod) => {
      // The module exports both the class IRCompiler and the convenience fn compileToIR
      return mod;
    }).catch((err) => {
      _compilerPromise = null; // allow retry
      throw err;
    });
  }
  return _compilerPromise;
}

async function compileSource(source) {
  const mod = await getCompiler();
  const compileToIR = mod.compileToIR || mod.default?.compileToIR;
  if (!compileToIR) {
    throw new Error('compileToIR not found in compiler module');
  }
  return compileToIR(source);
}

// ---------------------------------------------------------------------------
// Runtime engine helper — dynamic ESM import
// ---------------------------------------------------------------------------

const RUNTIME_PATH = path.join(MANIFEST_ROOT, 'dist', 'manifest', 'runtime-engine.js');

let _runtimePromise = null;

function getRuntimeEngine() {
  if (!_runtimePromise) {
    _runtimePromise = import(pathToFileURL(RUNTIME_PATH).href).then((mod) => {
      return mod;
    }).catch((err) => {
      _runtimePromise = null;
      throw err;
    });
  }
  return _runtimePromise;
}

// ---------------------------------------------------------------------------
// CLI helper — execSync wrapper
// ---------------------------------------------------------------------------

function runCLI(args) {
  const cmd = `node "${CLI_PATH}" ${args}`;
  try {
    const stdout = execSync(cmd, {
      cwd: MANIFEST_ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(stdout);
  } catch (err) {
    // execSync throws on non-zero exit; stdout may still contain valid JSON
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // fall through
      }
    }
    throw new Error(`CLI command failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerURL = process.env.VITE_DEV_SERVER_URL;

  if (devServerURL) {
    mainWindow.loadURL(devServerURL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

function registerIPC() {
  // ---- Settings ----------------------------------------------------------

  ipcMain.handle('get-manifest-root', () => {
    const settings = loadSettings();
    return settings.manifestRoot || '';
  });

  ipcMain.handle('set-manifest-root', (_event, { root }) => {
    saveSettings({ manifestRoot: root });
    return { success: true };
  });

  // ---- File operations ---------------------------------------------------

  ipcMain.handle('list-files', (_event, { root }) => {
    const files = findManifestFiles(root);
    return { files, root };
  });

  ipcMain.handle('read-file', (_event, { filePath }) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, path: filePath };
  });

  // ---- Compiler ----------------------------------------------------------

  ipcMain.handle('compile-file', async (_event, { filePath }) => {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { ir, diagnostics } = await compileSource(source);
    return { ir, diagnostics, source, file: filePath };
  });

  ipcMain.handle('compile-all', async (_event, { root }) => {
    const files = findManifestFiles(root);
    const results = [];

    for (const file of files) {
      try {
        const source = fs.readFileSync(file.path, 'utf-8');
        const { ir, diagnostics } = await compileSource(source);
        results.push({ file: file.path, name: file.name, ir, diagnostics });
      } catch (err) {
        results.push({
          file: file.path,
          name: file.name,
          ir: null,
          diagnostics: [{ severity: 'error', message: err.message }],
        });
      }
    }

    return { results, filesCompiled: results.length };
  });

  // ---- CLI scan ----------------------------------------------------------

  ipcMain.handle('scan-file', (_event, { filePath }) => {
    return runCLI(`scan "${filePath}" --format json`);
  });

  ipcMain.handle('scan-all', (_event, { root }) => {
    return runCLI(`scan "${root}" --format json`);
  });

  // ---- Profiling ----------------------------------------------------------

  ipcMain.handle('profile-compile', async (_event, { root }) => {
    const files = findManifestFiles(root);
    const results = [];

    for (const file of files) {
      const source = fs.readFileSync(file.path, 'utf-8');
      const sourceBytes = Buffer.byteLength(source, 'utf-8');
      const sourceLines = source.split('\n').length;

      const t0 = performance.now();
      const { ir, diagnostics } = await compileSource(source);
      const t1 = performance.now();
      const totalMs = t1 - t0;

      let metrics = null;
      if (ir) {
        metrics = {
          entities: ir.entities?.length || 0,
          commands: ir.commands?.length || 0,
          policies: ir.policies?.length || 0,
          events: ir.events?.length || 0,
          stores: ir.stores?.length || 0,
          properties: ir.entities?.reduce((sum, e) => sum + (e.properties?.length || 0), 0) || 0,
          guards: ir.commands?.reduce((sum, c) => sum + (c.guards?.length || 0), 0) || 0,
          actions: ir.commands?.reduce((sum, c) => sum + (c.actions?.length || 0), 0) || 0,
          constraints: ir.entities?.reduce((sum, e) => sum + (e.constraints?.length || 0), 0) || 0,
          relationships: ir.entities?.reduce((sum, e) => sum + (e.relationships?.length || 0), 0) || 0,
          computedProperties: ir.entities?.reduce((sum, e) => sum + (e.computedProperties?.length || 0), 0) || 0,
        };
      }

      results.push({
        file: file.path,
        name: file.name,
        sourceBytes,
        sourceLines,
        compileTimeMs: Math.round(totalMs * 100) / 100,
        success: ir !== null,
        diagnosticCount: diagnostics.length,
        metrics,
      });
    }

    results.sort((a, b) => b.compileTimeMs - a.compileTimeMs);
    const totalCompileMs = results.reduce((sum, r) => sum + r.compileTimeMs, 0);

    return {
      results,
      totalCompileMs: Math.round(totalCompileMs * 100) / 100,
      filesCompiled: results.length,
    };
  });

  ipcMain.handle('profile-runtime', async (_event, { filePath, commandName, input, context }) => {
    const source = fs.readFileSync(filePath, 'utf-8');

    const tCompile0 = performance.now();
    const { ir, diagnostics } = await compileSource(source);
    const tCompile1 = performance.now();

    if (!ir) {
      return {
        success: false,
        error: 'Compilation failed',
        diagnostics,
        phases: { compile: Math.round((tCompile1 - tCompile0) * 100) / 100 },
      };
    }

    const runtimeMod = await getRuntimeEngine();
    const tInit0 = performance.now();
    const engine = new runtimeMod.RuntimeEngine(ir, context || {}, {
      deterministicMode: true,
      requireValidProvenance: false,
    });
    const tInit1 = performance.now();

    if (!commandName) {
      const commands = ir.commands.map(c => ({
        name: c.name,
        entity: c.entity || null,
        paramCount: c.parameters.length,
        guardCount: c.guards.length,
        actionCount: c.actions.length,
        policyCount: (c.policies || []).length,
      }));
      return {
        success: true,
        availableCommands: commands,
        phases: {
          compile: Math.round((tCompile1 - tCompile0) * 100) / 100,
          init: Math.round((tInit1 - tInit0) * 100) / 100,
        },
      };
    }

    const tRun0 = performance.now();
    let result;
    try {
      result = await engine.runCommand(commandName, input || {});
    } catch (err) {
      return {
        success: false,
        error: err.message,
        phases: {
          compile: Math.round((tCompile1 - tCompile0) * 100) / 100,
          init: Math.round((tInit1 - tInit0) * 100) / 100,
          execute: Math.round((performance.now() - tRun0) * 100) / 100,
        },
      };
    }
    const tRun1 = performance.now();

    return {
      success: true,
      commandResult: result,
      phases: {
        compile: Math.round((tCompile1 - tCompile0) * 100) / 100,
        init: Math.round((tInit1 - tInit0) * 100) / 100,
        execute: Math.round((tRun1 - tRun0) * 100) / 100,
        total: Math.round((tRun1 - tCompile0) * 100) / 100,
      },
    };
  });

  ipcMain.handle('profile-static', async (_event, { root }) => {
    const files = findManifestFiles(root);
    const results = [];

    function exprDepth(expr) {
      if (!expr || typeof expr !== 'object') return 0;
      switch (expr.kind) {
        case 'literal': case 'identifier': return 1;
        case 'member': return 1 + exprDepth(expr.object);
        case 'binary': return 1 + Math.max(exprDepth(expr.left), exprDepth(expr.right));
        case 'unary': return 1 + exprDepth(expr.operand);
        case 'call': return 1 + Math.max(exprDepth(expr.callee), ...(expr.args || []).map(exprDepth), 0);
        case 'conditional': return 1 + Math.max(exprDepth(expr.condition), exprDepth(expr.consequent), exprDepth(expr.alternate));
        case 'array': return 1 + Math.max(0, ...(expr.elements || []).map(exprDepth));
        case 'object': return 1 + Math.max(0, ...(expr.properties || []).map(p => exprDepth(p.value)));
        case 'lambda': return 1 + exprDepth(expr.body);
        default: return 1;
      }
    }

    function exprNodeCount(expr) {
      if (!expr || typeof expr !== 'object') return 0;
      switch (expr.kind) {
        case 'literal': case 'identifier': return 1;
        case 'member': return 1 + exprNodeCount(expr.object);
        case 'binary': return 1 + exprNodeCount(expr.left) + exprNodeCount(expr.right);
        case 'unary': return 1 + exprNodeCount(expr.operand);
        case 'call': return 1 + exprNodeCount(expr.callee) + (expr.args || []).reduce((s, a) => s + exprNodeCount(a), 0);
        case 'conditional': return 1 + exprNodeCount(expr.condition) + exprNodeCount(expr.consequent) + exprNodeCount(expr.alternate);
        case 'array': return 1 + (expr.elements || []).reduce((s, e) => s + exprNodeCount(e), 0);
        case 'object': return 1 + (expr.properties || []).reduce((s, p) => s + exprNodeCount(p.value), 0);
        case 'lambda': return 1 + exprNodeCount(expr.body);
        default: return 1;
      }
    }

    for (const file of files) {
      const source = fs.readFileSync(file.path, 'utf-8');
      const { ir } = await compileSource(source);
      if (!ir) {
        results.push({ file: file.path, name: file.name, error: 'Compilation failed', analysis: null });
        continue;
      }

      const entities = ir.entities.map(entity => {
        const entityCommands = ir.commands.filter(c => c.entity === entity.name);
        const entityPolicies = ir.policies.filter(p => p.entity === entity.name);

        const commands = entityCommands.map(cmd => {
          const guardDepths = cmd.guards.map(g => exprDepth(g));
          const guardNodes = cmd.guards.map(g => exprNodeCount(g));
          return {
            name: cmd.name,
            guardCount: cmd.guards.length,
            maxGuardDepth: Math.max(0, ...guardDepths),
            totalGuardNodes: guardNodes.reduce((s, n) => s + n, 0),
            actionCount: cmd.actions.length,
            policyRefs: (cmd.policies || []).length,
            emitCount: cmd.emits.length,
            paramCount: cmd.parameters.length,
            constraintCount: (cmd.constraints || []).length,
            complexityScore: cmd.guards.length * 2 + Math.max(0, ...guardDepths) * 3 + cmd.actions.length + (cmd.policies || []).length + (cmd.constraints || []).length * 2,
          };
        });

        const relComplexity = entity.relationships.reduce((score, rel) => {
          return score + (rel.kind === 'hasMany' ? 3 : rel.kind === 'hasOne' ? 2 : 1);
        }, 0);

        const constraints = entity.constraints.map(c => ({
          name: c.name,
          severity: c.severity || 'block',
          depth: exprDepth(c.expression),
          nodes: exprNodeCount(c.expression),
          overrideable: c.overrideable || false,
        }));

        const computedProperties = entity.computedProperties.map(cp => ({
          name: cp.name,
          dependencyCount: cp.dependencies.length,
          expressionDepth: exprDepth(cp.expression),
          expressionNodes: exprNodeCount(cp.expression),
        }));

        return {
          name: entity.name,
          propertyCount: entity.properties.length,
          relationshipCount: entity.relationships.length,
          relComplexity,
          commandCount: entityCommands.length,
          policyCount: entityPolicies.length,
          constraintCount: entity.constraints.length,
          computedPropertyCount: entity.computedProperties.length,
          commands,
          constraints,
          computedProperties,
          complexityScore:
            entity.properties.length +
            relComplexity * 2 +
            commands.reduce((s, c) => s + c.complexityScore, 0) +
            constraints.reduce((s, c) => s + c.depth * 2, 0) +
            computedProperties.reduce((s, c) => s + c.expressionDepth * 2, 0),
        };
      });

      const policies = ir.policies.map(p => ({
        name: p.name,
        entity: p.entity || '(global)',
        action: p.action,
        expressionDepth: exprDepth(p.expression),
        expressionNodes: exprNodeCount(p.expression),
      }));

      const totalGuards = ir.commands.reduce((s, c) => s + c.guards.length, 0);
      const allGuardDepths = ir.commands.flatMap(c => c.guards.map(g => exprDepth(g)));
      const maxGuardDepth = Math.max(0, ...allGuardDepths);
      const totalExprNodes = ir.commands.reduce((s, c) =>
        s + c.guards.reduce((gs, g) => gs + exprNodeCount(g), 0) +
        c.actions.reduce((as, a) => as + exprNodeCount(a.expression), 0), 0);

      results.push({
        file: file.path,
        name: file.name,
        analysis: {
          entities,
          policies,
          summary: {
            entityCount: ir.entities.length,
            commandCount: ir.commands.length,
            policyCount: ir.policies.length,
            eventCount: ir.events.length,
            storeCount: ir.stores.length,
            totalGuards,
            maxGuardDepth,
            totalExprNodes,
            totalComplexity: entities.reduce((s, e) => s + e.complexityScore, 0),
          },
        },
      });
    }

    results.sort((a, b) => (b.analysis?.summary?.totalComplexity || 0) - (a.analysis?.summary?.totalComplexity || 0));
    return { results, filesAnalyzed: results.length };
  });

  // ---- IR Schema Validation -----------------------------------------------

  /** Ajv instance + compiled validator, lazily initialized */
  let _schemaValidator = null;

  async function getSchemaValidator() {
    if (_schemaValidator) return _schemaValidator;

    // Import Ajv from the schema-validator tool's node_modules
    const ajvPath = path.join(MANIFEST_ROOT, 'tools', 'manifest-ir-schema-validator', 'project', 'node_modules', 'ajv', 'dist', 'ajv.js');
    const ajvFormatsPath = path.join(MANIFEST_ROOT, 'tools', 'manifest-ir-schema-validator', 'project', 'node_modules', 'ajv-formats', 'dist', 'index.js');

    const AjvMod = await import(pathToFileURL(ajvPath).href);
    const addFormatsMod = await import(pathToFileURL(ajvFormatsPath).href);

    const Ajv = AjvMod.default || AjvMod;
    const addFormats = addFormatsMod.default || addFormatsMod;

    const schemaPath = path.join(MANIFEST_ROOT, 'docs', 'spec', 'ir', 'ir-v1.schema.json');
    const schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const ajv = new Ajv({ allErrors: true, verbose: true, strict: false, strictSchema: false, strictTypes: false });
    addFormats(ajv);

    const validate = ajv.compile(schemaData);
    _schemaValidator = { validate, schemaPath };
    return _schemaValidator;
  }

  ipcMain.handle('validate-ir', async (_event, { root }) => {
    const files = findManifestFiles(root);
    const { validate } = await getSchemaValidator();
    const results = [];

    for (const file of files) {
      try {
        const source = fs.readFileSync(file.path, 'utf-8');
        const { ir, diagnostics } = await compileSource(source);

        if (!ir) {
          results.push({
            file: file.path,
            name: file.name,
            valid: false,
            errors: [],
            compileError: diagnostics.map(d => d.message).join('; '),
          });
          continue;
        }

        const valid = validate(ir);
        const errors = valid ? [] : (validate.errors || []).map(err => ({
          path: err.instancePath || '/',
          message: err.message || 'Unknown validation error',
          keyword: err.keyword,
          params: err.params,
        }));

        results.push({
          file: file.path,
          name: file.name,
          valid,
          errors,
          compileError: null,
          entityCount: ir.entities?.length || 0,
          commandCount: ir.commands?.length || 0,
        });
      } catch (err) {
        results.push({
          file: file.path,
          name: file.name,
          valid: false,
          errors: [],
          compileError: err.message,
        });
      }
    }

    const passed = results.filter(r => r.valid).length;
    const failed = results.filter(r => !r.valid).length;
    return { results, total: results.length, passed, failed };
  });

  // ---- IR Diff -----------------------------------------------------------

  let _diffModule = null;

  async function getDiffModule() {
    if (_diffModule) return _diffModule;
    const diffPath = path.join(MANIFEST_ROOT, 'tools', 'IR-diff-explainer', 'project', 'packages', 'ir-diff', 'dist', 'index.js');
    _diffModule = await import(pathToFileURL(diffPath).href);
    return _diffModule;
  }

  ipcMain.handle('diff-ir', async (_event, { fileA, fileB }) => {
    // Compile both files
    const sourceA = fs.readFileSync(fileA, 'utf-8');
    const sourceB = fs.readFileSync(fileB, 'utf-8');

    const [resultA, resultB] = await Promise.all([
      compileSource(sourceA),
      compileSource(sourceB),
    ]);

    if (!resultA.ir) {
      return { success: false, error: `Failed to compile ${path.basename(fileA)}: ${resultA.diagnostics.map(d => d.message).join('; ')}` };
    }
    if (!resultB.ir) {
      return { success: false, error: `Failed to compile ${path.basename(fileB)}: ${resultB.diagnostics.map(d => d.message).join('; ')}` };
    }

    const diffMod = await getDiffModule();
    const config = { labels: [], highRisk: ['guards', 'policies', 'commands'] };
    const diffResult = diffMod.computeDiff(resultA.ir, resultB.ir, config);

    return {
      success: true,
      fileA: { path: fileA, name: path.basename(fileA) },
      fileB: { path: fileB, name: path.basename(fileB) },
      diff: diffResult,
    };
  });

  // ---- IR Structure (for script generation) --------------------------------

  ipcMain.handle('get-ir-structure', async (_event, { filePath }) => {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { ir, diagnostics } = await compileSource(source);

    if (!ir) {
      return { success: false, error: diagnostics.map(d => d.message).join('; ') };
    }

    const entities = (ir.entities || []).map(entity => {
      const entityCommands = (ir.commands || []).filter(c => c.entity === entity.name);
      return {
        name: entity.name,
        properties: (entity.properties || []).map(p => ({
          name: p.name,
          type: typeof p.type === 'object' && p.type?.name ? p.type.name : String(p.type),
          required: p.required || false,
          default: p.default !== undefined ? p.default : null,
        })),
        commands: entityCommands.map(cmd => ({
          name: cmd.name,
          parameters: (cmd.parameters || []).map(p => ({
            name: p.name,
            type: typeof p.type === 'object' && p.type?.name ? p.type.name : String(p.type),
          })),
          guardCount: (cmd.guards || []).length,
          actionCount: (cmd.actions || []).length,
          emitCount: (cmd.emits || []).length,
        })),
      };
    });

    return { success: true, entities };
  });

  // ---- Test Harness (uses real RuntimeEngine) ------------------------------

  /**
   * Format an IR expression AST node into a human-readable string.
   */
  function formatExpression(expr) {
    if (!expr || typeof expr !== 'object') return String(expr ?? '');
    switch (expr.kind) {
      case 'literal': {
        const v = expr.value;
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'object' && v.kind) {
          if (v.kind === 'null') return 'null';
          if (v.kind === 'string') return JSON.stringify(v.value);
          if (v.kind === 'boolean') return String(v.value);
          if (v.kind === 'number') return String(v.value);
          return JSON.stringify(v.value);
        }
        if (typeof v === 'string') return JSON.stringify(v);
        return String(v);
      }
      case 'identifier': return expr.name;
      case 'member': return `${formatExpression(expr.object)}.${expr.property}`;
      case 'binary': return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
      case 'unary': return `${expr.operator}${formatExpression(expr.operand)}`;
      case 'call': {
        const args = (expr.args || expr.arguments || []).map(formatExpression).join(', ');
        return `${formatExpression(expr.callee)}(${args})`;
      }
      case 'conditional': return `${formatExpression(expr.condition)} ? ${formatExpression(expr.consequent)} : ${formatExpression(expr.alternate)}`;
      case 'array': return `[${(expr.elements || []).map(formatExpression).join(', ')}]`;
      case 'object': return `{ ${(expr.properties || []).map(p => `${p.key || p.name}: ${formatExpression(p.value)}`).join(', ')} }`;
      case 'in': return `${formatExpression(expr.left)} in ${formatExpression(expr.right)}`;
      default:
        if (expr.left && expr.right && expr.operator) {
          return `${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)}`;
        }
        return JSON.stringify(expr);
    }
  }

  ipcMain.handle('run-test-script', async (_event, { filePath, script }) => {
    const source = fs.readFileSync(filePath, 'utf-8');
    const { ir, diagnostics } = await compileSource(source);

    if (!ir) {
      return {
        success: false,
        error: `Compilation failed: ${diagnostics.map(d => d.message).join('; ')}`,
      };
    }

    // Basic script validation
    if (!script || typeof script !== 'object') {
      return { success: false, error: 'Script must be a JSON object' };
    }
    if (!script.description) {
      return { success: false, error: 'Script must have a "description" field' };
    }
    if (!Array.isArray(script.commands) || script.commands.length === 0) {
      return { success: false, error: 'Script must have a non-empty "commands" array' };
    }

    const runtimeMod = await getRuntimeEngine();
    const context = script.context || {};

    // Execute each command step using the REAL RuntimeEngine
    const steps = [];
    for (const cmd of script.commands) {
      // Create a fresh engine for each step (stateless — each command is independent)
      const engine = new runtimeMod.RuntimeEngine(ir, context, {
        deterministicMode: true,
        requireValidProvenance: false,
      });

      let result;
      try {
        result = await engine.runCommand(cmd.command, cmd.params || {}, {
          entityName: cmd.entity,
          instanceId: cmd.id,
        });
      } catch (err) {
        result = {
          success: false,
          error: err.message,
          emittedEvents: [],
        };
      }

      // Build assertion checks
      const assertions = { passed: 0, failed: 0, details: [] };
      if (cmd.expect) {
        // Check success
        if (cmd.expect.success !== undefined) {
          const passed = cmd.expect.success === result.success;
          assertions.details.push({ check: 'success', expected: cmd.expect.success, actual: result.success, passed });
          if (passed) assertions.passed++; else assertions.failed++;
        }

        // Check guard failure
        if (cmd.expect.error) {
          if (cmd.expect.error.type === 'guard' && result.guardFailure) {
            assertions.details.push({ check: 'error.type', expected: 'guard', actual: 'guard', passed: true });
            assertions.passed++;
            if (cmd.expect.error.guardIndex !== undefined) {
              const passed = cmd.expect.error.guardIndex === result.guardFailure.index;
              assertions.details.push({ check: 'error.guardIndex', expected: cmd.expect.error.guardIndex, actual: result.guardFailure.index, passed });
              if (passed) assertions.passed++; else assertions.failed++;
            }
          } else if (cmd.expect.error.type === 'policy' && result.policyDenial) {
            assertions.details.push({ check: 'error.type', expected: 'policy', actual: 'policy', passed: true });
            assertions.passed++;
          } else if (cmd.expect.error.type) {
            const actualType = result.guardFailure ? 'guard' : result.policyDenial ? 'policy' : result.error ? 'error' : null;
            const passed = cmd.expect.error.type === actualType;
            assertions.details.push({ check: 'error.type', expected: cmd.expect.error.type, actual: actualType, passed });
            if (passed) assertions.passed++; else assertions.failed++;
          }
        }

        // Check emitted events
        if (cmd.expect.emittedEvents) {
          const actualEvents = (result.emittedEvents || []).map(e => e.event || e.name || e);
          const passed = JSON.stringify(cmd.expect.emittedEvents) === JSON.stringify(actualEvents);
          assertions.details.push({ check: 'emittedEvents', expected: cmd.expect.emittedEvents, actual: actualEvents, passed });
          if (passed) assertions.passed++; else assertions.failed++;
        }
      }

      // Format the step result to match HarnessStepResult UI interface
      const stepResult = {
        success: result.success,
        error: result.error ? { type: 'error', message: result.error } : null,
        emittedEvents: (result.emittedEvents || []).map(e => ({
          name: e.event || e.name || String(e),
          data: e.payload || e.data || {},
        })),
        guardFailures: null,
        constraintWarnings: (result.constraintOutcomes || [])
          .filter(c => !c.passed)
          .map(c => c.formatted || c.message || c.constraintName || 'constraint failed'),
        entityStateAfter: result.result || null,
      };

      // Format guard failure (runtime halts on first, but UI expects an array)
      if (result.guardFailure) {
        stepResult.guardFailures = [{
          guardIndex: result.guardFailure.index,
          expression: result.guardFailure.formatted || formatExpression(result.guardFailure.expression),
          resolvedValues: Object.fromEntries(
            (result.guardFailure.resolved || []).map((r, i) => [String(i), r])
          ),
          evaluatedTo: false,
        }];
        stepResult.error = {
          type: 'guard',
          message: result.guardFailure.formatted || formatExpression(result.guardFailure.expression),
          guardIndex: result.guardFailure.index,
        };
      }

      // Format policy denial
      if (result.policyDenial) {
        stepResult.error = {
          type: 'policy',
          message: result.policyDenial.message || result.policyDenial.formatted || formatExpression(result.policyDenial.expression),
        };
      }

      steps.push({
        step: cmd.step || steps.length + 1,
        command: {
          entity: cmd.entity,
          id: cmd.id,
          name: cmd.command,
          params: cmd.params || {},
        },
        result: stepResult,
        assertions,
      });
    }

    const totalSteps = steps.length;
    const passedSteps = steps.filter(s => s.assertions.failed === 0).length;

    return {
      success: true,
      output: {
        harness: { version: '2.0.0-real', executedAt: new Date().toISOString() },
        source: { type: 'manifest', path: filePath, irHash: ir.provenance?.irHash || 'n/a' },
        script: { path: '<inline>', description: script.description },
        execution: { context, steps },
        summary: {
          totalSteps,
          passed: passedSteps,
          failed: totalSteps - passedSteps,
          assertionsPassed: steps.reduce((s, st) => s + st.assertions.passed, 0),
          assertionsFailed: steps.reduce((s, st) => s + st.assertions.failed, 0),
        },
      },
    };
  });

  ipcMain.handle('validate-test-script', async (_event, { script }) => {
    // Simple validation — no longer depends on the harness module
    const errors = [];
    if (!script || typeof script !== 'object') return { valid: false, errors: ['Script must be an object'] };
    if (!script.description) errors.push('description is required');
    if (!Array.isArray(script.commands)) errors.push('commands must be an array');
    else if (script.commands.length === 0) errors.push('commands must not be empty');
    else {
      for (let i = 0; i < script.commands.length; i++) {
        const cmd = script.commands[i];
        if (!cmd.entity) errors.push(`commands[${i}].entity is required`);
        if (!cmd.id) errors.push(`commands[${i}].id is required`);
        if (!cmd.command) errors.push(`commands[${i}].command is required`);
        if (cmd.expect === undefined) errors.push(`commands[${i}].expect is required`);
      }
    }
    return { valid: errors.length === 0, errors };
  });

  // ---- Directory picker --------------------------------------------------

  ipcMain.handle('pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIPC();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
