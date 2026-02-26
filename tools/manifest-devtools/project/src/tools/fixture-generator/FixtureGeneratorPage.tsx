import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  TestTube2,
  FileCode2,
  Loader2,
  Copy,
  Check,
  Wand2,
} from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';
import {
  runTestScript,
  getIRStructure,
  listFiles,
  type HarnessResult,
  type HarnessStepResult,
  type ManifestFile,
  type IREntityInfo,
} from '../../lib/api';

/** Build a working sample script from real IR structure.
 *  Seeds ALL entities and picks the first command from the first entity. */
function generateSampleScript(entities: IREntityInfo[]): string {
  if (entities.length === 0) {
    return JSON.stringify({ description: 'No entities found', commands: [] }, null, 2);
  }

  // Seed every entity so cross-entity commands work
  const seedEntities = entities.map((entity) => ({
    entity: entity.name,
    id: `${entity.name.toLowerCase()}-1`,
    properties: buildDefaultProperties(entity),
  }));

  // Pick the first entity that has commands
  const entityWithCmd = entities.find(e => e.commands.length > 0);
  if (!entityWithCmd) {
    return JSON.stringify({
      description: `Test (no commands found)`,
      context: {},
      seedEntities,
      commands: [],
    }, null, 2);
  }

  const cmd = entityWithCmd.commands[0];
  const params: Record<string, unknown> = {};
  for (const p of cmd.parameters) {
    params[p.name] = getDefaultForParam(p.type, p.name);
  }

  // Build all command steps — one per command across all entities
  const commands = [];
  let step = 0;
  for (const entity of entities) {
    for (const c of entity.commands) {
      step++;
      const cParams: Record<string, unknown> = {};
      for (const p of c.parameters) {
        cParams[p.name] = getDefaultForParam(p.type, p.name);
      }
      commands.push({
        step,
        entity: entity.name,
        id: `${entity.name.toLowerCase()}-1`,
        command: c.name,
        params: cParams,
        expect: { success: true },
      });
    }
  }

  return JSON.stringify({
    description: `Test ${entityWithCmd.name}.${cmd.name}`,
    context: {
      user: { id: 'test-user-1', role: 'admin', name: 'Test Admin' },
      tenant: 'test-tenant-1',
    },
    seedEntities,
    commands: commands.length > 0 ? commands : [{
      step: 1,
      entity: entityWithCmd.name,
      id: `${entityWithCmd.name.toLowerCase()}-1`,
      command: cmd.name,
      params,
      expect: { success: true },
    }],
  }, null, 2);
}

/** Build seed properties with realistic defaults that won't trip guards. */
function buildDefaultProperties(entity: IREntityInfo): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const p of entity.properties) {
    // Use the manifest-declared default if available
    if (p.default !== null && p.default !== undefined) {
      props[p.name] = resolveDefault(p.default);
    } else {
      props[p.name] = getDefaultForProperty(p.type, p.name);
    }
  }
  return props;
}

/** Resolve IR default values — they may be wrapped in { kind, value } AST nodes */
function resolveDefault(val: unknown): unknown {
  if (val && typeof val === 'object' && 'kind' in (val as Record<string, unknown>)) {
    const node = val as Record<string, unknown>;
    if (node.kind === 'null') return null;
    if (node.kind === 'literal' && 'value' in node) return resolveDefault(node.value);
    if ('value' in node) return node.value;
  }
  return val;
}

/** Generate a realistic default for an entity property (used for seeding). */
function getDefaultForProperty(type: string, name: string): unknown {
  const lower = name.toLowerCase();
  // Type always wins — prevents ID-named number fields from getting strings
  if (type === 'number') {
    if (lower.includes('price') || lower.includes('amount') || lower.includes('cost')) return 10;
    if (lower.includes('order') || lower.includes('sort')) return 1;
    if (lower.includes('min')) return 0;
    if (lower.includes('max')) return 100;
    if (lower.includes('quantity') || lower.includes('count')) return 5;
    return 1;
  }
  if (type === 'boolean') return true;
  // String fields — name-based patterns
  if (lower === 'id') return `${name}-1`;
  if (lower.endsWith('id')) return `${name}-1`;
  if (lower === 'name' || lower.endsWith('name')) return 'Test Item';
  if (lower === 'description') return 'Test description';
  if (lower === 'status') return 'active';
  if (lower === 'category' || lower === 'course') return 'General';
  if (lower === 'tags') return 'test';
  if (lower === 'reason') return 'Testing';
  if (lower.includes('notes')) return 'Test notes';
  if (lower.includes('type')) return 'default';
  if (type === 'string') return `test-${name}`;
  return `test-${name}`;
}

/** Generate a realistic default for a command parameter (used in command invocation). */
function getDefaultForParam(type: string, name: string): unknown {
  const lower = name.toLowerCase();
  // "new" prefixed params — common update pattern: newName, newDescription, etc.
  if (lower.startsWith('new')) {
    const baseName = name.slice(3); // strip "new"
    return getDefaultForProperty(type, baseName);
  }
  // Type always wins
  if (type === 'number') {
    if (lower.includes('price') || lower.includes('amount') || lower.includes('cost')) return 10;
    if (lower.includes('order') || lower.includes('sort')) return 1;
    if (lower.includes('min')) return 0;
    if (lower.includes('max')) return 100;
    if (lower.includes('quantity') || lower.includes('count')) return 5;
    return 1;
  }
  if (type === 'boolean') return true;
  // String fields
  if (lower === 'id') return `${name}-1`;
  if (lower.endsWith('id')) return `${name}-1`;
  if (lower === 'name' || lower.endsWith('name')) return 'Updated Item';
  if (lower === 'description') return 'Updated description';
  if (lower === 'status') return 'active';
  if (lower === 'category' || lower === 'course') return 'General';
  if (lower === 'tags') return 'test';
  if (lower === 'reason') return 'Testing';
  if (lower.includes('notes')) return 'Updated notes';
  if (lower.includes('type')) return 'default';
  if (type === 'string') return `test-${name}`;
  return `test-${name}`;
}

export default function FixtureGeneratorPage() {
  const [files, setFiles] = useState<ManifestFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [result, setResult] = useState<HarnessResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [entities, setEntities] = useState<IREntityInfo[]>([]);
  const [loadingIR, setLoadingIR] = useState(false);

  useEffect(() => {
    listFiles().then(({ files: f }) => {
      setFiles(f);
      if (f.length > 0) setSelectedFile(f[0].path);
    }).catch(() => {});
  }, []);

  // When file changes, load IR structure and generate sample script
  useEffect(() => {
    if (!selectedFile) return;
    setLoadingIR(true);
    setResult(null);
    setError(null);
    getIRStructure(selectedFile).then((data) => {
      if (data.success && data.entities) {
        setEntities(data.entities);
        setScriptText(generateSampleScript(data.entities));
      } else {
        setEntities([]);
        setError(data.error || 'Failed to compile file');
      }
    }).catch((e) => {
      setEntities([]);
      setError(e instanceof Error ? e.message : 'Failed to load IR');
    }).finally(() => setLoadingIR(false));
  }, [selectedFile]);

  const scriptValid = useMemo(() => {
    try {
      JSON.parse(scriptText);
      return true;
    } catch {
      return false;
    }
  }, [scriptText]);

  const run = useCallback(async () => {
    if (!selectedFile || !scriptValid) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const script = JSON.parse(scriptText);
      const data = await runTestScript(selectedFile, script);
      if (!data.success) {
        setError(data.error || 'Test script failed');
        if (data.validationErrors) {
          setError(`Script validation failed:\n${data.validationErrors.join('\n')}`);
        }
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  }, [selectedFile, scriptText, scriptValid]);

  const copyOutput = useCallback(async () => {
    if (!result?.output) return;
    await navigator.clipboard.writeText(JSON.stringify(result.output, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const regenerateScript = useCallback(() => {
    if (entities.length > 0) {
      setScriptText(generateSampleScript(entities));
      setResult(null);
      setError(null);
    }
  }, [entities]);

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">IR Test Harness</h1>
        <p className="text-sm text-slate-400">
          Run scripted test commands against compiled IR. Seed entities, execute commands, and verify assertions.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-slate-500 mb-1 block">Manifest File</label>
          <select
            value={selectedFile}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="tool-input w-full"
          >
            <option value="">Select file...</option>
            {files.map((f) => (
              <option key={f.path} value={f.path}>{f.name}</option>
            ))}
          </select>
        </div>

        <button onClick={run} disabled={running || !selectedFile || !scriptValid} className="btn-primary">
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Running...
            </span>
          ) : (
            <>
              <Play size={14} /> Run Script
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Script editor + entity info */}
        <div className="space-y-3">
          <div className="tool-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <TestTube2 size={14} /> Test Script
              </h3>
              <div className="flex items-center gap-2">
                {entities.length > 0 && (
                  <button onClick={regenerateScript} className="btn-ghost text-xs" title="Regenerate from IR">
                    <Wand2 size={12} /> Regenerate
                  </button>
                )}
                {scriptValid ? (
                  <span className="badge-success text-[10px]">Valid JSON</span>
                ) : (
                  <span className="badge-error text-[10px]">Invalid JSON</span>
                )}
              </div>
            </div>
            {loadingIR ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 size={16} className="animate-spin mr-2" /> Loading IR structure...
              </div>
            ) : (
              <CodeEditor
                value={scriptText}
                onChange={setScriptText}
                placeholder="Enter test script JSON..."
                height="360px"
              />
            )}
          </div>

          {/* Entity quick-reference */}
          {entities.length > 0 && (
            <EntityReference entities={entities} onInsertCommand={(entity, cmd) => {
              try {
                const current = JSON.parse(scriptText);
                const stepNum = (current.commands?.length || 0) + 1;
                const params: Record<string, unknown> = {};
                for (const p of cmd.parameters) {
                  params[p.name] = getDefaultForParam(p.type, p.name);
                }
                const newCmd = {
                  step: stepNum,
                  entity: entity.name,
                  id: `${entity.name.toLowerCase()}-1`,
                  command: cmd.name,
                  params,
                  expect: { success: true },
                };
                if (!current.commands) current.commands = [];
                current.commands.push(newCmd);
                setScriptText(JSON.stringify(current, null, 2));
              } catch {
                // script isn't valid JSON, can't insert
              }
            }} />
          )}

          <ScriptHelp />
        </div>

        {/* Right: Results */}
        <div className="space-y-3">
          {error && (
            <div className="tool-panel p-4 border-l-4 border-l-rose-500 animate-slide-in">
              <div className="flex items-start gap-2 text-rose-400">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <pre className="text-sm whitespace-pre-wrap">{error}</pre>
              </div>
            </div>
          )}

          {!result && !error && (
            <div className="tool-panel flex flex-col items-center justify-center py-24 text-slate-500">
              <TestTube2 size={32} className="mb-3 text-slate-600" />
              <p className="text-sm">Select a file and click "Run Script"</p>
              <p className="text-xs text-slate-600 mt-1">A sample script is auto-generated from the file's IR</p>
            </div>
          )}

          {result?.output && (
            <>
              {/* Summary */}
              <div className={`tool-panel p-4 border-l-4 animate-slide-in ${
                result.output.summary.failed === 0 ? 'border-l-emerald-500' : 'border-l-rose-500'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {result.output.summary.failed === 0 ? (
                      <CheckCircle2 size={18} className="text-emerald-400" />
                    ) : (
                      <XCircle size={18} className="text-rose-400" />
                    )}
                    <span className="text-sm font-medium text-slate-200">
                      {result.output.summary.failed === 0 ? 'All Steps Passed' : `${result.output.summary.failed} Step(s) Failed`}
                    </span>
                  </div>
                  <button onClick={copyOutput} className="btn-ghost text-xs">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy Output'}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-3 text-center">
                  <MiniStat label="Steps" value={result.output.summary.totalSteps} />
                  <MiniStat label="Passed" value={result.output.summary.passed} color="text-emerald-400" />
                  <MiniStat label="Failed" value={result.output.summary.failed} color="text-rose-400" />
                  <MiniStat
                    label="Assertions"
                    value={`${result.output.summary.assertionsPassed}/${result.output.summary.assertionsPassed + result.output.summary.assertionsFailed}`}
                  />
                </div>
              </div>

              {/* Metadata */}
              <div className="tool-panel p-3 text-xs text-slate-500 flex flex-wrap gap-4">
                <span>Harness v{result.output.harness.version}</span>
                <span>Source: {result.output.source.type}</span>
                <span className="code-font">IR hash: {result.output.source.irHash.slice(0, 16)}...</span>
              </div>

              {/* Step details */}
              <div className="space-y-2">
                {result.output.execution.steps.map((step, i) => (
                  <StepRow key={i} step={step} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <div className={`text-lg font-bold ${color || 'text-slate-300'}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function EntityReference({ entities, onInsertCommand }: {
  entities: IREntityInfo[];
  onInsertCommand: (entity: IREntityInfo, cmd: IREntityInfo['commands'][0]) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="tool-panel p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-xs text-slate-400 font-medium"
      >
        <FileCode2 size={12} />
        <span>Available Entities & Commands ({entities.length})</span>
        {expanded ? <ChevronDown size={12} className="ml-auto text-slate-600" /> : <ChevronRight size={12} className="ml-auto text-slate-600" />}
      </button>
      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {entities.map((entity) => (
            <div key={entity.name} className="text-xs">
              <div className="text-slate-300 font-medium code-font mb-1">{entity.name}</div>
              <div className="ml-3 space-y-0.5">
                {entity.commands.map((cmd) => (
                  <div key={cmd.name} className="flex items-center gap-2">
                    <button
                      onClick={() => onInsertCommand(entity, cmd)}
                      className="text-accent hover:text-accent/80 code-font"
                      title={`Add ${entity.name}.${cmd.name} step to script`}
                    >
                      + {cmd.name}
                    </button>
                    <span className="text-slate-600">
                      ({cmd.parameters.map(p => `${p.name}: ${p.type}`).join(', ')})
                    </span>
                    {cmd.guardCount > 0 && <span className="text-[10px] text-amber-500">{cmd.guardCount}g</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: HarnessStepResult }) {
  const [expanded, setExpanded] = useState(false);
  const passed = step.assertions.failed === 0;

  return (
    <div className={`tool-panel overflow-hidden border-l-4 ${passed ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left px-4 py-3"
      >
        {passed ? (
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        ) : (
          <XCircle size={14} className="text-rose-400 shrink-0" />
        )}

        <span className="text-xs text-slate-500">Step {step.step}</span>
        <span className="text-sm text-slate-200 font-medium code-font">
          {step.command.entity}.{step.command.name}
        </span>
        <span className="text-[10px] text-slate-500">id: {step.command.id}</span>

        <span className="ml-auto text-[10px] text-slate-500">
          {step.assertions.passed}/{step.assertions.passed + step.assertions.failed} assertions
        </span>

        {expanded ? <ChevronDown size={14} className="text-slate-600" /> : <ChevronRight size={14} className="text-slate-600" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-surface-border pt-3 space-y-3 animate-fade-in">
          {/* Command result */}
          <div className="text-xs">
            <span className="text-slate-500">Result: </span>
            <span className={step.result.success ? 'text-emerald-400' : 'text-rose-400'}>
              {step.result.success ? 'success' : 'failed'}
            </span>
            {step.result.error && (
              <span className="text-rose-400 ml-2">
                ({step.result.error.type}: {step.result.error.message})
              </span>
            )}
          </div>

          {/* Guard failures */}
          {step.result.guardFailures && step.result.guardFailures.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">Guard Failures:</p>
              {step.result.guardFailures.map((gf, i) => (
                <div key={i} className="text-xs text-rose-400 code-font ml-2">
                  [{gf.guardIndex}] {gf.expression}
                </div>
              ))}
            </div>
          )}

          {/* Emitted events */}
          {step.result.emittedEvents.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">Emitted Events:</p>
              <div className="flex flex-wrap gap-1">
                {step.result.emittedEvents.map((ev, i) => (
                  <span key={i} className="badge-info text-[10px]">{ev.name}</span>
                ))}
              </div>
            </div>
          )}

          {/* Entity state after */}
          {step.result.entityStateAfter && (
            <div>
              <p className="text-[10px] text-slate-500 mb-1">Entity State After:</p>
              <pre className="text-xs code-font text-slate-400 bg-surface rounded p-2 border border-surface-border overflow-x-auto max-h-32">
                {JSON.stringify(step.result.entityStateAfter, null, 2)}
              </pre>
            </div>
          )}

          {/* Assertion details */}
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Assertions:</p>
            <div className="space-y-1">
              {step.assertions.details.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {d.passed ? (
                    <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle size={10} className="text-rose-400 shrink-0" />
                  )}
                  <span className="code-font text-slate-400">{d.check}</span>
                  {!d.passed && (
                    <span className="text-rose-400">
                      expected {JSON.stringify(d.expected)}, got {JSON.stringify(d.actual)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptHelp() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tool-panel p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-xs text-slate-500"
      >
        <FileCode2 size={12} />
        <span>Script Format Reference</span>
        {expanded ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
      </button>
      {expanded && (
        <div className="mt-3 text-xs text-slate-500 space-y-2 animate-fade-in">
          <p><span className="text-slate-400">description</span> — Test description (required)</p>
          <p><span className="text-slate-400">context</span> — Runtime context object (optional)</p>
          <p><span className="text-slate-400">seedEntities</span> — Array of {`{ entity, id, properties }`} to pre-populate</p>
          <p><span className="text-slate-400">commands</span> — Array of steps to execute:</p>
          <pre className="code-font text-[10px] text-slate-600 bg-surface rounded p-2 border border-surface-border">
{`{
  "step": 1,
  "entity": "EntityName",
  "id": "entity-1",
  "command": "commandName",
  "params": {},
  "expect": {
    "success": true,
    "error": { "type": "guard", "guardIndex": 0 },
    "stateAfter": { "status": "active" },
    "emittedEvents": ["EventName"]
  }
}`}
          </pre>
          <p className="text-slate-600">
            Expect fields: <span className="code-font">success</span> (required), <span className="code-font">error</span>, <span className="code-font">stateAfter</span>, <span className="code-font">emittedEvents</span>, <span className="code-font">constraintWarnings</span>
          </p>
        </div>
      )}
    </div>
  );
}
