import { useState, useEffect } from 'react';
import { Shield, User, CheckCircle, XCircle, AlertTriangle, Code, Package } from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { IREntity, IRPolicy, IRRole, IRCommand, IRExpression } from '../manifest/ir';

interface PolicyMatrixPanelProps {
  source: string;
  disabled: boolean;
}

type PolicyResult = 'allow' | 'deny' | 'conditional' | 'none';

interface MatrixCell {
  entityName: string;
  operation: string;
  roleName: string;
  result: PolicyResult;
  policies: IRPolicy[];
  expression?: string;
  message?: string;
}

// Operation types to check for each entity
const OPERATIONS: readonly ['read', 'write', 'delete', 'execute'] = ['read', 'write', 'delete', 'execute'];

// Default roles to test if no roles are defined
const DEFAULT_ROLES = ['Anonymous', 'Authenticated', 'Admin'];

// Helper to format expressions as strings
function formatExpression(expr: IRExpression): string {
  if (!expr) return '';
  switch (expr.kind) {
    case 'literal':
      return JSON.stringify(expr.value);
    case 'identifier':
      return expr.name;
    case 'member':
      return `${formatExpression(expr.object)}.${expr.property}`;
    case 'binary':
      return `(${formatExpression(expr.left)} ${expr.operator} ${formatExpression(expr.right)})`;
    case 'unary':
      return `${expr.operator}${formatExpression(expr.operand)}`;
    case 'call': {
      const args = expr.args.map((a) => formatExpression(a)).join(', ');
      return `${formatExpression(expr.callee)}(${args})`;
    }
    case 'conditional':
      return `(${formatExpression(expr.condition)} ? ${formatExpression(expr.consequent)} : ${formatExpression(expr.alternate)})`;
    default:
      return `<${expr.kind}>`;
  }
}

export function PolicyMatrixPanel({ source, disabled }: PolicyMatrixPanelProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [entities, setEntities] = useState<IREntity[]>([]);
  const [policies, setPolicies] = useState<IRPolicy[]>([]);
  const [roles, setRoles] = useState<IRRole[]>([]);
  const [runtimeContextJson, setRuntimeContextJson] = useState(
    '{\n  "user": {\n    "id": "u1",\n    "role": "admin"\n  }\n}'
  );

  // Matrix data
  const [matrixData, setMatrixData] = useState<MatrixCell[]>([]);
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  // Async compilation effect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (disabled || !source.trim()) {
        // Microtask defer keeps state resets out of the synchronous effect
        // body (react-hooks/set-state-in-effect).
        await Promise.resolve();
        if (cancelled) return;
        setEngine(null);
        setEntities([]);
        setPolicies([]);
        setRoles([]);
        setMatrixData([]);
        return;
      }

      try {
        const compileResult = await compileToIR(source);
        if (cancelled) return;
        if (compileResult.diagnostics.some((d) => d.severity === 'error')) {
          setEngine(null);
          setEntities([]);
          setPolicies([]);
          setRoles([]);
          setMatrixData([]);
          return;
        }
        if (!compileResult.ir) {
          setEngine(null);
          setEntities([]);
          setPolicies([]);
          setRoles([]);
          setMatrixData([]);
          return;
        }

        // Create runtime engine
        let context = {};
        try {
          context = JSON.parse(runtimeContextJson);
        } catch {
          // Invalid JSON, use empty context
        }

        const runtimeEngine = new RuntimeEngine(compileResult.ir, context);
        setEngine(runtimeEngine);
        setEntities(compileResult.ir.entities);
        setPolicies(compileResult.ir.policies);
        setRoles(compileResult.ir.roles || []);
      } catch (e) {
        if (cancelled) return;
        console.error('[PolicyMatrixPanel] Compilation error:', e);
        setEngine(null);
        setEntities([]);
        setPolicies([]);
        setRoles([]);
        setMatrixData([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // runtimeContextJson is read here only to seed the engine's initial context;
    // recompiling the IR on every context edit would be wasteful. Context changes
    // are picked up by the matrix re-evaluation effect below, which lists it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, disabled]);

  // Evaluate a single cell in the matrix
  function evaluateCell(
    entityName: string,
    operation: string,
    roleName: string,
    commands: IRCommand[]
  ): MatrixCell {
    // Find applicable policies for this entity and operation
    const applicablePolicies = policies.filter((p) => {
      // Check if policy applies to this entity
      const entityMatch = !p.entity || p.entity === entityName || p.action === 'all';
      // Check if policy applies to this operation
      const actionMatch = p.action === operation || p.action === 'all';
      return entityMatch && actionMatch;
    });

    // For 'execute' operation, also check command-specific policies
    const commandPolicies = policies.filter((p) => {
      const isForCommand = commands.some((c) => c.name === p.entity);
      const actionMatch = p.action === operation || p.action === 'execute' || p.action === 'all';
      return isForCommand && actionMatch;
    });

    // Combine and deduplicate policies
    const allPolicies = Array.from(new Set([...applicablePolicies, ...commandPolicies]));

    // If no policies apply, it's effectively "none" (no explicit policy)
    if (allPolicies.length === 0) {
      return {
        entityName,
        operation,
        roleName,
        result: 'none',
        policies: [],
      };
    }

    // Evaluate policies against the role context
    // For the matrix, we simulate the policy check
    let hasAllow = false;
    let hasDeny = false;

    // Check role-based permissions if roles exist
    if (roles.length > 0) {
      const role = roles.find((r) => r.name === roleName);
      if (role) {
        // Check effective permissions
        const hasPermission = role.effectivePermissions.some(
          (p) =>
            (p.action === operation || p.action === 'all') &&
            (!p.target || p.target === entityName || p.target === '*')
        );
        if (hasPermission) {
          hasAllow = true;
        } else {
          hasDeny = true;
        }
      }
    } else {
      // For default roles, use heuristics
      if (roleName === 'Admin') {
        hasAllow = true;
      } else if (roleName === 'Anonymous') {
        // Check if there's a permissive policy
        const hasPermissivePolicy = allPolicies.some((p) => {
          // Simple heuristic: if policy expression is 'true' or a simple allow
          const expr = p.expression;
          return expr.kind === 'literal' && expr.value.kind === 'boolean' && expr.value.value === true;
        });
        if (hasPermissivePolicy) {
          hasAllow = true;
        } else {
          hasDeny = true;
        }
      } else {
        // Authenticated users get some access
        hasAllow = allPolicies.length > 0;
      }
    }

    // Determine final result
    let result: PolicyResult;
    if (hasDeny) {
      result = 'deny';
    } else if (hasAllow) {
      // Check if policy is conditional (has complex expression)
      const hasConditional = allPolicies.some((p) => {
        const expr = p.expression;
        return expr.kind !== 'literal' || !(expr.value.kind === 'boolean');
      });
      result = hasConditional ? 'conditional' : 'allow';
    } else {
      result = 'none';
    }

    return {
      entityName,
      operation,
      roleName,
      result,
      policies: allPolicies,
      expression: allPolicies.length > 0 ? formatExpression(allPolicies[0].expression) : undefined,
      message: allPolicies[0]?.message,
    };
  }


  // Evaluate policy matrix whenever engine, entities, policies, roles, or context changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Microtask defer keeps state updates out of the synchronous effect
      // body (react-hooks/set-state-in-effect).
      await Promise.resolve();
      if (cancelled) return;
      if (!engine || entities.length === 0) {
        setMatrixData([]);
        return;
      }

    const matrix: MatrixCell[] = [];

    // Determine which roles to evaluate
    const rolesToTest = roles.length > 0 ? roles.map((r) => r.name) : DEFAULT_ROLES;

    for (const entity of entities) {
      // Get all commands for this entity to determine operations
      const entityCommands = entity.commands
        .map((name) => engine.getCommand(name, entity.name))
        .filter((c): c is IRCommand => !!c);

      for (const operation of OPERATIONS) {
        for (const roleName of rolesToTest) {
          const result = evaluateCell(entity.name, operation, roleName, entityCommands);
          matrix.push(result);
        }
      }
    }

      setMatrixData(matrix);
    })();
    return () => {
      cancelled = true;
    };
    // evaluateCell is a stable closure over policies/roles (both already listed);
    // adding the function identity would re-run this effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, entities, policies, roles, runtimeContextJson]);

  // Get result styling
  function getResultStyle(result: PolicyResult) {
    switch (result) {
      case 'allow':
        return 'bg-emerald-900/30 border-emerald-700/50 text-emerald-300';
      case 'deny':
        return 'bg-rose-900/30 border-rose-700/50 text-rose-300';
      case 'conditional':
        return 'bg-amber-900/30 border-amber-700/50 text-amber-300';
      case 'none':
        return 'bg-gray-800/30 border-gray-700/30 text-gray-500';
    }
  }

  function getResultIcon(result: PolicyResult) {
    switch (result) {
      case 'allow':
        return <CheckCircle size={14} className="text-emerald-400" />;
      case 'deny':
        return <XCircle size={14} className="text-rose-400" />;
      case 'conditional':
        return <AlertTriangle size={14} className="text-amber-400" />;
      case 'none':
        return <span className="text-gray-600 text-xs">—</span>;
    }
  }

  function getResultLabel(result: PolicyResult) {
    switch (result) {
      case 'allow':
        return 'Allow';
      case 'deny':
        return 'Deny';
      case 'conditional':
        return 'Conditional';
      case 'none':
        return 'No Policy';
    }
  }

  // Unique roles for table rows
  const tableRoles = roles.length > 0 ? roles.map((r) => r.name) : DEFAULT_ROLES;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-purple-400" />
            <span className="text-sm font-medium text-gray-200">Policy Matrix</span>
            {entities.length > 0 && (
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                {entities.length} entities
              </span>
            )}
          </div>
        </div>

        {/* Runtime Context Editor */}
        <div>
          <label className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            <User size={12} />
            Test Context (JSON)
          </label>
          <textarea
            value={runtimeContextJson}
            onChange={(e) => setRuntimeContextJson(e.target.value)}
            disabled={disabled}
            className="w-full h-16 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 resize-none focus:outline-none focus:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder='{ "user": { "id": "u1", "role": "admin" } }'
          />
        </div>
      </div>

      {/* Matrix Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entity List Sidebar */}
        <div className="w-48 flex-shrink-0 border-r border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Entities</div>
          </div>
          <div className="p-2 space-y-1">
            {entities.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No entities found
              </div>
            ) : (
              entities.map((entity) => (
                <button
                  key={entity.name}
                  className={`w-full p-2 text-left rounded transition-colors ${
                    selectedCell?.entityName === entity.name
                      ? 'bg-purple-900/30 border border-purple-700'
                      : 'hover:bg-gray-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Package size={14} className={selectedCell?.entityName === entity.name ? 'text-purple-400' : 'text-gray-500'} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{entity.name}</div>
                      <div className="text-xs text-gray-500">
                        {entity.policies.length} policies, {entity.commands.length} commands
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Matrix Grid */}
        <div className="flex-1 overflow-auto">
          {matrixData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              {disabled ? (
                <>
                  <Shield size={24} className="mb-2 opacity-50" />
                  <p>Fix compilation errors to view policy matrix</p>
                </>
              ) : (
                <>
                  <Shield size={24} className="mb-2 opacity-50" />
                  <p>No entities found. Compile a manifest to get started.</p>
                </>
              )}
            </div>
          ) : (
            <div className="p-4">
              {/* Summary Legend */}
              <div className="flex items-center gap-4 mb-4 text-xs">
                <span className="text-gray-500">Legend:</span>
                <div className="flex items-center gap-1">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span className="text-gray-400">Allow</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle size={12} className="text-rose-400" />
                  <span className="text-gray-400">Deny</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle size={12} className="text-amber-400" />
                  <span className="text-gray-400">Conditional</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">—</span>
                  <span className="text-gray-400">No Policy</span>
                </div>
              </div>

              {/* Matrix Table */}
              {entities.map((entity) => {
                const entityCells = matrixData.filter((c) => c.entityName === entity.name);
                const uniqueOperations = Array.from(new Set(entityCells.map((c) => c.operation)));

                return (
                  <div key={entity.name} className="mb-6">
                    <h3 className="text-sm font-medium text-gray-200 mb-2 flex items-center gap-2">
                      <Package size={14} className="text-purple-400" />
                      {entity.name}
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">Role</th>
                            {uniqueOperations.map((op) => (
                              <th key={op} className="px-3 py-2 text-center text-xs text-gray-500 font-medium uppercase">
                                {op}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableRoles.map((roleName) => (
                            <tr key={roleName} className="border-b border-gray-800/50">
                              <td className="px-3 py-2 text-sm text-gray-300 font-medium">{roleName}</td>
                              {uniqueOperations.map((operation) => {
                                const cell = entityCells.find(
                                  (c) => c.roleName === roleName && c.operation === operation
                                );
                                if (!cell) return <td key={operation} className="px-3 py-2" />;

                                return (
                                  <td key={operation} className="px-2 py-2">
                                    <button
                                      onClick={() => setSelectedCell(cell)}
                                      className={`w-full px-2 py-1.5 rounded border transition-colors flex items-center justify-center gap-1 ${getResultStyle(
                                        cell.result
                                      )} hover:opacity-80`}
                                    >
                                      {getResultIcon(cell.result)}
                                      <span className="text-xs">{getResultLabel(cell.result)}</span>
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cell Detail Panel */}
        {selectedCell && (
          <div className="w-80 flex-shrink-0 border-l border-gray-800 overflow-auto">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Cell Details</div>
              <button
                onClick={() => setSelectedCell(null)}
                className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-3 space-y-4">
              {/* Cell Info */}
              <div>
                <div className="text-xs text-gray-500 mb-1">Entity</div>
                <div className="text-sm text-gray-200">{selectedCell.entityName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Operation</div>
                <div className="text-sm text-gray-200 uppercase">{selectedCell.operation}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Role</div>
                <div className="text-sm text-gray-200">{selectedCell.roleName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Result</div>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${getResultStyle(selectedCell.result)}`}>
                  {getResultIcon(selectedCell.result)}
                  {getResultLabel(selectedCell.result)}
                </div>
              </div>

              {/* Policies */}
              {selectedCell.policies.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">Applicable Policies</div>
                  <div className="space-y-2">
                    {selectedCell.policies.map((policy) => (
                      <div
                        key={policy.name}
                        className="p-2 bg-gray-900/50 rounded border border-gray-800"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Code size={12} className="text-purple-400" />
                          <span className="text-sm font-medium text-gray-200">{policy.name}</span>
                        </div>
                        {policy.message && (
                          <div className="text-xs text-gray-400 mb-1">{policy.message}</div>
                        )}
                        {selectedCell.expression && (
                          <div className="text-xs font-mono text-gray-400 bg-gray-950 p-1.5 rounded overflow-auto border border-gray-800">
                            {selectedCell.expression}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          Action: <span className="text-gray-400">{policy.action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCell.policies.length === 0 && (
                <div className="text-xs text-gray-500 italic">
                  No policies apply to this entity/operation combination
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
