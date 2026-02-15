# Real Profiler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fake demo profiler with three real profiling modes that use actual compiler/runtime data from `.manifest` files.

**Architecture:** The profiler gets three tabs: (1) Compile-Time — measures real wall-clock time to compile each file through the IR compiler, (2) Runtime — instantiates a RuntimeEngine with compiled IR and runs commands with user-provided context, measuring each pipeline stage, (3) Static Analysis — walks the compiled IR tree computing complexity scores without execution. All data flows through Electron IPC from the main process (which has access to the compiler and runtime engine). The React UI reuses the existing FlameChart and adds tab navigation.

**Tech Stack:** Electron IPC (main process), `performance.now()` for timing, existing `IRCompiler` + `RuntimeEngine` from `dist/manifest/`, React + Tailwind for UI.

---

## Architecture Overview

```
React UI (renderer)                    Electron Main Process
========================              ========================
ProfilerPage.tsx                      main.cjs IPC handlers
  Tab 1: CompileProfileTab  ------>   'profile-compile'    → IRCompiler with timing
  Tab 2: RuntimeProfileTab  ------>   'profile-runtime'    → RuntimeEngine with timing
  Tab 3: StaticAnalysisTab  ------>   'profile-static'     → IR tree walker
                                      
FlameChart.tsx (reused)               All use real data from:
traceBuilder.ts (rewritten)           dist/manifest/ir-compiler.js
                                      dist/manifest/runtime-engine.js
```

## Key Design Decisions

1. **All profiling happens in the Electron main process** — the compiler and runtime are Node.js ESM modules. The renderer sends IPC requests and receives structured results.

2. **FlameChart is reused as-is** — it already accepts `FlameNode` trees. We just need to produce real `FlameNode` data instead of fake data.

3. **The traceBuilder.ts is replaced entirely** — the old one parsed pseudo-code. The new one transforms profiling results into `FlameNode` trees.

4. **Runtime profiling requires user-provided context** — the UI provides a JSON editor for `RuntimeContext` (user, etc.) and command input. This is the same pattern the Guard Debugger will need.

---

## Task 1: Add Three New IPC Handlers to Electron Main Process

**Files:**
- Modify: `tools/manifest-devtools/project/electron/main.cjs` (add 3 IPC handlers)

### Step 1: Add `profile-compile` IPC handler

This handler compiles a single file (or all files) and returns real timing data for each compilation phase.

Add after the existing `scan-all` handler (around line 224):

```javascript
// ---- Profiling --------------------------------------------------------

ipcMain.handle('profile-compile', async (_event, { root }) => {
  const files = findManifestFiles(root);
  const results = [];

  for (const file of files) {
    const source = fs.readFileSync(file.path, 'utf-8');
    const sourceBytes = Buffer.byteLength(source, 'utf-8');
    const sourceLines = source.split('\n').length;

    // Time the full compilation
    const t0 = performance.now();
    const { ir, diagnostics } = await compileSource(source);
    const t1 = performance.now();
    const totalMs = t1 - t0;

    // Extract IR metrics if compilation succeeded
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

  // Sort by compile time descending (slowest first)
  results.sort((a, b) => b.compileTimeMs - a.compileTimeMs);

  const totalCompileMs = results.reduce((sum, r) => sum + r.compileTimeMs, 0);

  return {
    results,
    totalCompileMs: Math.round(totalCompileMs * 100) / 100,
    filesCompiled: results.length,
  };
});
```

### Step 2: Add `profile-runtime` IPC handler

This handler compiles a file, instantiates a RuntimeEngine, runs a command, and returns per-stage timing.

```javascript
ipcMain.handle('profile-runtime', async (_event, { filePath, commandName, input, context }) => {
  const source = fs.readFileSync(filePath, 'utf-8');

  // Phase 1: Compile
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

  // Phase 2: Instantiate runtime
  const runtimeMod = await getRuntimeEngine();
  const tInit0 = performance.now();
  const engine = new runtimeMod.RuntimeEngine(ir, context || {}, {
    deterministicMode: true,
    requireValidProvenance: false,
  });
  const tInit1 = performance.now();

  // Phase 3: Run command
  if (!commandName) {
    // Return available commands if none specified
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
  const result = await engine.runCommand(commandName, input || {});
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
```

### Step 3: Add `profile-static` IPC handler

This handler compiles all files and returns deep structural complexity analysis of the IR.

```javascript
ipcMain.handle('profile-static', async (_event, { root }) => {
  const files = findManifestFiles(root);
  const results = [];

  for (const file of files) {
    const source = fs.readFileSync(file.path, 'utf-8');
    const { ir } = await compileSource(source);
    if (!ir) {
      results.push({ file: file.path, name: file.name, error: 'Compilation failed', analysis: null });
      continue;
    }

    // Analyze expression complexity
    function exprDepth(expr) {
      if (!expr || typeof expr !== 'object') return 0;
      switch (expr.kind) {
        case 'literal':
        case 'identifier':
          return 1;
        case 'member':
          return 1 + exprDepth(expr.object);
        case 'binary':
          return 1 + Math.max(exprDepth(expr.left), exprDepth(expr.right));
        case 'unary':
          return 1 + exprDepth(expr.operand);
        case 'call':
          return 1 + Math.max(exprDepth(expr.callee), ...expr.args.map(exprDepth));
        case 'conditional':
          return 1 + Math.max(exprDepth(expr.condition), exprDepth(expr.consequent), exprDepth(expr.alternate));
        case 'array':
          return 1 + Math.max(0, ...expr.elements.map(exprDepth));
        case 'object':
          return 1 + Math.max(0, ...expr.properties.map(p => exprDepth(p.value)));
        case 'lambda':
          return 1 + exprDepth(expr.body);
        default:
          return 1;
      }
    }

    function exprNodeCount(expr) {
      if (!expr || typeof expr !== 'object') return 0;
      switch (expr.kind) {
        case 'literal':
        case 'identifier':
          return 1;
        case 'member':
          return 1 + exprNodeCount(expr.object);
        case 'binary':
          return 1 + exprNodeCount(expr.left) + exprNodeCount(expr.right);
        case 'unary':
          return 1 + exprNodeCount(expr.operand);
        case 'call':
          return 1 + exprNodeCount(expr.callee) + expr.args.reduce((s, a) => s + exprNodeCount(a), 0);
        case 'conditional':
          return 1 + exprNodeCount(expr.condition) + exprNodeCount(expr.consequent) + exprNodeCount(expr.alternate);
        case 'array':
          return 1 + expr.elements.reduce((s, e) => s + exprNodeCount(e), 0);
        case 'object':
          return 1 + expr.properties.reduce((s, p) => s + exprNodeCount(p.value), 0);
        case 'lambda':
          return 1 + exprNodeCount(expr.body);
        default:
          return 1;
      }
    }

    // Per-entity analysis
    const entities = ir.entities.map(entity => {
      const entityCommands = ir.commands.filter(c => c.entity === entity.name);
      const entityPolicies = ir.policies.filter(p => p.entity === entity.name);

      // Guard complexity per command
      const commandAnalysis = entityCommands.map(cmd => {
        const guardDepths = cmd.guards.map(g => exprDepth(g));
        const guardNodes = cmd.guards.map(g => exprNodeCount(g));
        const actionCount = cmd.actions.length;
        const policyRefs = (cmd.policies || []).length;

        return {
          name: cmd.name,
          guardCount: cmd.guards.length,
          maxGuardDepth: Math.max(0, ...guardDepths),
          totalGuardNodes: guardNodes.reduce((s, n) => s + n, 0),
          actionCount,
          policyRefs,
          emitCount: cmd.emits.length,
          paramCount: cmd.parameters.length,
          constraintCount: (cmd.constraints || []).length,
          // Complexity score: weighted sum
          complexityScore: cmd.guards.length * 2 + Math.max(0, ...guardDepths) * 3 + actionCount + policyRefs + (cmd.constraints || []).length * 2,
        };
      });

      // Relationship complexity
      const relComplexity = entity.relationships.reduce((score, rel) => {
        return score + (rel.kind === 'hasMany' ? 3 : rel.kind === 'hasOne' ? 2 : 1);
      }, 0);

      // Constraint complexity
      const constraintAnalysis = entity.constraints.map(c => ({
        name: c.name,
        severity: c.severity || 'block',
        depth: exprDepth(c.expression),
        nodes: exprNodeCount(c.expression),
        overrideable: c.overrideable || false,
      }));

      // Computed property dependency chains
      const computedAnalysis = entity.computedProperties.map(cp => ({
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
        commands: commandAnalysis,
        constraints: constraintAnalysis,
        computedProperties: computedAnalysis,
        // Entity-level complexity score
        complexityScore:
          entity.properties.length +
          relComplexity * 2 +
          commandAnalysis.reduce((s, c) => s + c.complexityScore, 0) +
          constraintAnalysis.reduce((s, c) => s + c.depth * 2, 0) +
          computedAnalysis.reduce((s, c) => s + c.expressionDepth * 2, 0),
      };
    });

    // Policy analysis
    const policyAnalysis = ir.policies.map(p => ({
      name: p.name,
      entity: p.entity || '(global)',
      action: p.action,
      expressionDepth: exprDepth(p.expression),
      expressionNodes: exprNodeCount(p.expression),
    }));

    // Cross-cutting metrics
    const totalGuards = ir.commands.reduce((s, c) => s + c.guards.length, 0);
    const maxGuardDepth = Math.max(0, ...ir.commands.flatMap(c => c.guards.map(g => exprDepth(g))));
    const totalExprNodes = ir.commands.reduce((s, c) =>
      s + c.guards.reduce((gs, g) => gs + exprNodeCount(g), 0) +
      c.actions.reduce((as, a) => as + exprNodeCount(a.expression), 0), 0);

    results.push({
      file: file.path,
      name: file.name,
      analysis: {
        entities,
        policies: policyAnalysis,
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

  // Sort by complexity descending
  results.sort((a, b) => (b.analysis?.summary?.totalComplexity || 0) - (a.analysis?.summary?.totalComplexity || 0));

  return { results, filesAnalyzed: results.length };
});
```

### Step 4: Add `getRuntimeEngine` helper (alongside existing `getCompiler`)

Add near the existing `getCompiler()` function:

```javascript
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
```

### Step 5: Verify the IPC handlers work

Run: `npm run electron:dev` from `tools/manifest-devtools/project/`
Expected: App launches without errors in the Electron main process console.

---

## Task 2: Add IPC Bridge Methods to Preload and API Layer

**Files:**
- Modify: `tools/manifest-devtools/project/electron/preload.cjs`
- Modify: `tools/manifest-devtools/project/src/lib/api.ts`

### Step 1: Add 3 new methods to preload.cjs

Add to the `contextBridge.exposeInMainWorld('electronAPI', { ... })` object:

```javascript
profileCompile: (root) => ipcRenderer.invoke('profile-compile', { root }),
profileRuntime: (opts) => ipcRenderer.invoke('profile-runtime', opts),
profileStatic: (root) => ipcRenderer.invoke('profile-static', { root }),
```

### Step 2: Add TypeScript interfaces and methods to api.ts

Add new interfaces for profiling results:

```typescript
export interface CompileProfileResult {
  results: Array<{
    file: string;
    name: string;
    sourceBytes: number;
    sourceLines: number;
    compileTimeMs: number;
    success: boolean;
    diagnosticCount: number;
    metrics: {
      entities: number;
      commands: number;
      policies: number;
      events: number;
      stores: number;
      properties: number;
      guards: number;
      actions: number;
      constraints: number;
      relationships: number;
      computedProperties: number;
    } | null;
  }>;
  totalCompileMs: number;
  filesCompiled: number;
}

export interface RuntimeProfileResult {
  success: boolean;
  error?: string;
  diagnostics?: Array<{ severity: string; message: string }>;
  availableCommands?: Array<{
    name: string;
    entity: string | null;
    paramCount: number;
    guardCount: number;
    actionCount: number;
    policyCount: number;
  }>;
  commandResult?: {
    success: boolean;
    result?: unknown;
    error?: string;
    guardFailure?: unknown;
    policyDenial?: unknown;
    emittedEvents: Array<unknown>;
  };
  phases: {
    compile: number;
    init?: number;
    execute?: number;
    total?: number;
  };
}

export interface StaticAnalysisResult {
  results: Array<{
    file: string;
    name: string;
    error?: string;
    analysis: {
      entities: Array<{
        name: string;
        propertyCount: number;
        relationshipCount: number;
        relComplexity: number;
        commandCount: number;
        policyCount: number;
        constraintCount: number;
        computedPropertyCount: number;
        commands: Array<{
          name: string;
          guardCount: number;
          maxGuardDepth: number;
          totalGuardNodes: number;
          actionCount: number;
          policyRefs: number;
          emitCount: number;
          paramCount: number;
          constraintCount: number;
          complexityScore: number;
        }>;
        constraints: Array<{
          name: string;
          severity: string;
          depth: number;
          nodes: number;
          overrideable: boolean;
        }>;
        computedProperties: Array<{
          name: string;
          dependencyCount: number;
          expressionDepth: number;
          expressionNodes: number;
        }>;
        complexityScore: number;
      }>;
      policies: Array<{
        name: string;
        entity: string;
        action: string;
        expressionDepth: number;
        expressionNodes: number;
      }>;
      summary: {
        entityCount: number;
        commandCount: number;
        policyCount: number;
        eventCount: number;
        storeCount: number;
        totalGuards: number;
        maxGuardDepth: number;
        totalExprNodes: number;
        totalComplexity: number;
      };
    } | null;
  }>;
  filesAnalyzed: number;
}
```

Add to the `Window['electronAPI']` declaration:

```typescript
profileCompile: (root: string) => Promise<CompileProfileResult>;
profileRuntime: (opts: { filePath: string; commandName?: string; input?: Record<string, unknown>; context?: Record<string, unknown> }) => Promise<RuntimeProfileResult>;
profileStatic: (root: string) => Promise<StaticAnalysisResult>;
```

Add API functions:

```typescript
export async function profileCompile(): Promise<CompileProfileResult> {
  return requireElectronAPI().profileCompile(_manifestRoot);
}

export async function profileRuntime(opts: {
  filePath: string;
  commandName?: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<RuntimeProfileResult> {
  return requireElectronAPI().profileRuntime(opts);
}

export async function profileStatic(): Promise<StaticAnalysisResult> {
  return requireElectronAPI().profileStatic(_manifestRoot);
}
```

---

## Task 3: Rewrite ProfilerPage.tsx with Three Tabs

**Files:**
- Rewrite: `tools/manifest-devtools/project/src/tools/profiler/ProfilerPage.tsx`

Replace the entire file. The new ProfilerPage has:
- Tab bar: "Compile Time" | "Runtime" | "Static Analysis"
- Each tab renders its own component
- No more fake SAMPLE_CODE or buildTrace

The tab components are:
1. `CompileProfileTab` — click "Profile" → calls `profileCompile()` → shows per-file timing bars + summary stats
2. `RuntimeProfileTab` — select file → select command → provide context JSON → run → shows phase timing breakdown
3. `StaticAnalysisTab` — click "Analyze" → calls `profileStatic()` → shows complexity heatmap per entity/command

---

## Task 4: Build CompileProfileTab Component

**Files:**
- Create: `tools/manifest-devtools/project/src/tools/profiler/CompileProfileTab.tsx`

This tab:
1. Has a "Profile All Files" button
2. Calls `profileCompile()` via IPC
3. Shows summary stats bar: total compile time, files compiled, total entities/commands/guards
4. Shows per-file horizontal bar chart (sorted by compile time, slowest first)
5. Each bar shows: filename, compile time (ms), source lines, entity/command counts
6. Reuses the FlameChart to show a flame-style view where each file is a top-level node and its IR metrics are children

---

## Task 5: Build RuntimeProfileTab Component

**Files:**
- Create: `tools/manifest-devtools/project/src/tools/profiler/RuntimeProfileTab.tsx`

This tab:
1. File selector dropdown (populated from `listFiles()`)
2. When file selected, calls `profileRuntime({ filePath, commandName: undefined })` to get available commands
3. Command selector dropdown
4. JSON editor for runtime context (`{ "user": { "id": "1", "role": "admin" } }`)
5. JSON editor for command input (`{ "name": "Alice" }`)
6. "Execute & Profile" button
7. Shows phase timing breakdown: compile → init → execute → total
8. Shows command result (success/failure, guard failure details, emitted events)
9. Phase timing shown as horizontal stacked bar (compile=blue, init=yellow, execute=green)

---

## Task 6: Build StaticAnalysisTab Component

**Files:**
- Create: `tools/manifest-devtools/project/src/tools/profiler/StaticAnalysisTab.tsx`

This tab:
1. "Analyze All Files" button
2. Calls `profileStatic()` via IPC
3. Shows per-file summary cards with complexity scores
4. Expandable entity details: property count, relationship complexity, command complexity
5. Per-command complexity breakdown: guard depth, action count, policy refs
6. Color-coded complexity scores (green < 10, yellow 10-30, red > 30)
7. "Hotspots" section: top 5 most complex commands across all files

---

## Task 7: Delete Old Fake traceBuilder.ts

**Files:**
- Delete or gut: `tools/manifest-devtools/project/src/tools/profiler/traceBuilder.ts`

The old `buildTrace()` function and its fake timing logic are no longer used. Either delete the file entirely or replace it with a utility that converts profiling results into `FlameNode` trees for the FlameChart component.

Keep the `FlameNode` and `ProfileStats` interfaces if the FlameChart still uses them, but remove all the fake code (`extractBlocks`, `seedRandom`, `BASE_TIMINGS`, etc.).

---

## Task 8: Verify Everything Works

### Step 1: Restart Electron

Kill existing processes, run `npm run electron:dev` from `tools/manifest-devtools/project/`.

### Step 2: Test Compile-Time tab

1. Navigate to Profiler in sidebar
2. "Compile Time" tab should be active by default
3. Click "Profile All Files"
4. Should see real compile times for all 7 Capsule-Pro manifest files
5. Bars should be sorted by compile time
6. Summary stats should show real entity/command/guard counts

### Step 3: Test Runtime tab

1. Switch to "Runtime" tab
2. Select a manifest file from dropdown
3. Available commands should populate
4. Select a command, provide minimal input
5. Click "Execute & Profile"
6. Should see real phase timings and command result

### Step 4: Test Static Analysis tab

1. Switch to "Static Analysis" tab
2. Click "Analyze All Files"
3. Should see complexity scores per entity/command
4. Hotspots section should highlight the most complex commands

### Step 5: Verify tests still pass

Run: `npm test` from repo root
Expected: All 630+ tests pass (profiler changes are UI-only, no runtime/compiler changes)

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `electron/main.cjs` | Modify | Add 3 IPC handlers + getRuntimeEngine helper |
| `electron/preload.cjs` | Modify | Add 3 bridge methods |
| `src/lib/api.ts` | Modify | Add 3 interfaces + 3 API functions + Window type |
| `src/tools/profiler/ProfilerPage.tsx` | Rewrite | Tab-based layout, no more fake code |
| `src/tools/profiler/CompileProfileTab.tsx` | Create | Real compile-time profiling UI |
| `src/tools/profiler/RuntimeProfileTab.tsx` | Create | Real runtime command profiling UI |
| `src/tools/profiler/StaticAnalysisTab.tsx` | Create | Real IR complexity analysis UI |
| `src/tools/profiler/traceBuilder.ts` | Delete/gut | Remove all fake timing code |
| `src/tools/profiler/FlameChart.tsx` | Keep | Reused as-is for compile-time visualization |
