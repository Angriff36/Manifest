import { useState, useEffect } from 'react';
import { Play, Plus, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronRight, Trash2, List, Info, Shield, Ban } from 'lucide-react';
import { compileToIR } from '../manifest/ir-compiler';
import { RuntimeEngine } from '../manifest/runtime-engine';
import type { CommandResult, EmittedEvent, EntityInstance, PolicyDenial } from '../manifest/runtime-engine';

// The Tiny App fixture - a task management system
const TINY_APP_FIXTURE = `# Tiny App Demo Fixture
# A complete task management application demonstrating full Manifest language capabilities

entity Task {
  property required title: string = ""
  property optional description: string = ""
  property required status: string = "todo"
  property optional priority: number = 1
  property required assigneeId: string = ""
  property required createdAt: number = 0

  computed isOverdue: boolean = (now() - self.createdAt) > 86400000 and self.status != "done"
  computed assignedUser: string = self.assigneeId != "" ? self.assigneeId : "Unassigned"
  computed isHighPriority: boolean = self.priority != null and self.priority >= 3

  command updateStatus(newStatus: string) {
    guard newStatus != null and newStatus != ""
    guard newStatus == "todo" or newStatus == "in-progress" or newStatus == "done"
    mutate status = newStatus
    emit TaskStatusUpdated
  }

  command assignTask(userId: string) {
    guard userId != null and userId != ""
    guard self.assigneeId == "" or user.role == "admin"
    mutate assigneeId = userId
    emit TaskAssigned
  }

  command setTimestamp() {
    compute createdAt = now()
    emit TaskCreated
  }

  store Task in memory
}

policy OnlyCreatorOrAssignee execute: user.role == "admin" or user.id == self.assigneeId "Only admins or the assigned user can modify this task"

event TaskCreated: "tasks.created" {
  id: string
  title: string
  status: string
  createdAt: number
}

event TaskStatusUpdated: "tasks.updated" {
  id: string
  oldStatus: string
  newStatus: string
  updatedAt: number
}

event TaskAssigned: "tasks.assigned" {
  id: string
  assigneeId: string
  assignedAt: number
}
`;

interface TinyAppPanelProps {
  disabled?: boolean;
}

interface TaskInstance extends EntityInstance {
  title: string;
  description: string;
  status: string;
  priority: number;
  assigneeId: string;
  createdAt: number;
  isOverdue?: boolean;
  assignedUser?: string;
  isHighPriority?: boolean;
}

export function TinyAppPanel({ disabled = false }: TinyAppPanelProps) {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null);
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<EmittedEvent[]>([]);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Set<string>>(new Set());

  // User context simulation
  const [currentUser] = useState<{ id: string; role: string }>({
    id: 'admin-1',
    role: 'admin'
  });

  // Command form state
  const [selectedCommand, setSelectedCommand] = useState<string>('setTimestamp');
  const [commandParams, setCommandParams] = useState<string>('{}');

  // Initialize engine
  useEffect(() => {
    if (disabled) return;

    try {
      const compileResult = compileToIR(TINY_APP_FIXTURE);
      if (compileResult.diagnostics.some(d => d.severity === 'error')) {
        setError('Compilation errors in fixture');
        return;
      }
      if (!compileResult.ir) {
        setError('Failed to compile fixture');
        return;
      }

      const runtimeEngine = new RuntimeEngine(compileResult.ir, { user: currentUser }, {
        generateId: () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        now: () => Date.now()
      });
      setEngine(runtimeEngine);

      // Create some sample tasks
      const task1 = runtimeEngine.createInstance('Task', {
        id: 'task-1',
        title: 'Fix authentication bug',
        description: 'Users cannot log in with SAML',
        status: 'todo',
        priority: 3,
        assigneeId: 'user-1',
        createdAt: Date.now() - 86400000 * 2 // 2 days ago
      } as unknown as EntityInstance);

      const task2 = runtimeEngine.createInstance('Task', {
        id: 'task-2',
        title: 'Update documentation',
        description: 'Add API docs for new endpoints',
        status: 'in-progress',
        priority: 2,
        assigneeId: 'user-2',
        createdAt: Date.now() - 3600000 // 1 hour ago
      } as unknown as EntityInstance);

      const task3 = runtimeEngine.createInstance('Task', {
        id: 'task-3',
        title: 'Design new landing page',
        description: 'Create mockups for homepage redesign',
        status: 'todo',
        priority: 1,
        assigneeId: '',
        createdAt: Date.now()
      } as unknown as EntityInstance);

      setTasks([task1!, task2!, task3!].map(t => ({
        ...(t as unknown as TaskInstance),
        isOverdue: runtimeEngine.evaluateComputed('Task', t.id, 'isOverdue') as boolean,
        assignedUser: runtimeEngine.evaluateComputed('Task', t.id, 'assignedUser') as string,
        isHighPriority: runtimeEngine.evaluateComputed('Task', t.id, 'isHighPriority') as boolean
      })) as TaskInstance[]);

      setEventLog(runtimeEngine.getEventLog());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [disabled, currentUser]);

  const refreshTasks = () => {
    if (!engine) return;

    const allTasks = engine.getAllInstances('Task') || [];
    const taskList = allTasks.map(t => ({
      ...(t as unknown as TaskInstance),
      isOverdue: engine.evaluateComputed('Task', t.id, 'isOverdue') as boolean,
      assignedUser: engine.evaluateComputed('Task', t.id, 'assignedUser') as string,
      isHighPriority: engine.evaluateComputed('Task', t.id, 'isHighPriority') as boolean
    }));
    setTasks(taskList as TaskInstance[]);
  };

  const handleCreateTask = () => {
    if (!engine) return;

    try {
      const newTask = engine.createInstance('Task', {
        id: '',
        title: 'New Task',
        description: '',
        status: 'todo',
        priority: 1,
        assigneeId: '',
        createdAt: 0
      } as unknown as EntityInstance);

      if (newTask) {
        // Run setTimestamp to set the createdAt
        engine.runCommand('setTimestamp', {}, { entityName: 'Task', instanceId: newTask.id });

        refreshTasks();
        setSelectedTaskId(newTask.id);
        setEventLog(engine.getEventLog());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteTask = (taskId: string) => {
    if (!engine) return;

    try {
      // Note: RuntimeEngine doesn't have a delete method, so we'll filter from our local state
      setTasks(prev => prev.filter(t => t.id !== taskId));
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleExecuteCommand = async () => {
    if (!engine || !selectedTaskId) {
      setError('Select a task first');
      return;
    }

    setError(null);
    setCommandResult(null);

    try {
      const params = JSON.parse(commandParams);
      engine.replaceContext({ user: currentUser });

      const result = await engine.runCommand(selectedCommand, params, {
        entityName: 'Task',
        instanceId: selectedTaskId
      });

      setCommandResult(result);
      refreshTasks();
      setEventLog(engine.getEventLog());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClearEventLog = () => {
    if (engine) {
      engine.clearEventLog();
      setEventLog([]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'text-gray-400 bg-gray-800';
      case 'in-progress': return 'text-amber-400 bg-amber-900/30';
      case 'done': return 'text-emerald-400 bg-emerald-900/30';
      default: return 'text-gray-400 bg-gray-800';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 3) return 'text-rose-400';
    if (priority === 2) return 'text-amber-400';
    return 'text-gray-400';
  };

  const formatGuardFailure = (failure: CommandResult['guardFailure']) => {
    if (!failure) return null;

    const guardKey = `guard-${failure.index}`;
    const isExpanded = expandedDiagnostics.has(guardKey);
    const toggleExpanded = () => {
      setExpandedDiagnostics(prev => {
        const next = new Set(prev);
        if (next.has(guardKey)) {
          next.delete(guardKey);
        } else {
          next.add(guardKey);
        }
        return next;
      });
    };

    return (
      <div className="mt-2 bg-rose-900/20 rounded border border-rose-800/50">
        <button
          onClick={toggleExpanded}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-rose-900/30 transition-colors rounded"
        >
          {isExpanded ? <ChevronDown size={14} className="text-rose-400" /> : <ChevronRight size={14} className="text-rose-400" />}
          <Ban size={14} className="text-rose-400" />
          <span className="text-sm font-medium text-rose-300">
            Guard #{failure.index} failed
          </span>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3">
            <div className="text-xs text-rose-400 font-mono mb-2 bg-rose-950/30 px-2 py-1 rounded">
              {failure.formatted}
            </div>
          </div>
        )}
      </div>
    );
  };

  const formatPolicyDenial = (denial: PolicyDenial) => {
    const policyKey = `policy-${denial.policyName}`;
    const isExpanded = expandedDiagnostics.has(policyKey);
    const toggleExpanded = () => {
      setExpandedDiagnostics(prev => {
        const next = new Set(prev);
        if (next.has(policyKey)) {
          next.delete(policyKey);
        } else {
          next.add(policyKey);
        }
        return next;
      });
    };

    return (
      <div className="mt-2 bg-amber-900/20 rounded border border-amber-800/50">
        <button
          onClick={toggleExpanded}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-amber-900/30 transition-colors rounded"
        >
          {isExpanded ? <ChevronDown size={14} className="text-amber-400" /> : <ChevronRight size={14} className="text-amber-400" />}
          <Shield size={14} className="text-amber-400" />
          <span className="text-sm font-medium text-amber-300">
            Policy Denial: <code className="text-amber-400">{denial.policyName}</code>
          </span>
        </button>
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2">
            {denial.message && (
              <div className="text-xs text-amber-400">
                <span className="font-medium">Message:</span> {denial.message}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List size={16} className="text-emerald-400" />
            <span className="text-sm font-medium text-gray-200">Tiny App Demo</span>
            <span className="text-xs text-gray-500">Task Management</span>
          </div>
          <button
            onClick={handleCreateTask}
            disabled={disabled || !engine}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={12} />
            New Task
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Task List */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Tasks ({tasks.length})</div>
          </div>
          <div className="p-2 space-y-1">
            {tasks.map(task => (
              <button
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={`w-full p-2 text-left rounded transition-colors ${
                  selectedTaskId === task.id
                    ? 'bg-sky-900/30 border border-sky-700'
                    : 'hover:bg-gray-900 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">{task.title}</div>
                    <div className="text-xs text-gray-500 truncate">{task.description || 'No description'}</div>
                  </div>
                  <div className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(task.status)}`}>
                    {task.status}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs">
                  <span className={getPriorityColor(task.priority)}>
                    P{task.priority}
                  </span>
                  {task.isHighPriority && (
                    <span className="text-rose-400">High</span>
                  )}
                  {task.isOverdue && (
                    <span className="text-orange-400">Overdue</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Task Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedTask ? (
            <>
              <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-900/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-200">{selectedTask.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{selectedTask.description || 'No description'}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteTask(selectedTask.id)}
                    className="p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-900/20 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-3 bg-gray-900/50 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 mb-1">Status</div>
                    <div className={`inline-block px-2 py-1 rounded text-sm ${getStatusColor(selectedTask.status)}`}>
                      {selectedTask.status}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-900/50 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 mb-1">Priority</div>
                    <div className={`text-sm font-medium ${getPriorityColor(selectedTask.priority)}`}>
                      Priority {selectedTask.priority}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-900/50 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 mb-1">Assigned To</div>
                    <div className="text-sm text-gray-300">{selectedTask.assignedUser}</div>
                  </div>
                  <div className="p-3 bg-gray-900/50 rounded border border-gray-800">
                    <div className="text-xs text-gray-500 mb-1">Created</div>
                    <div className="text-sm text-gray-300">
                      {selectedTask.createdAt > 0
                        ? new Date(selectedTask.createdAt).toLocaleString()
                        : 'Not set'}
                    </div>
                  </div>
                </div>

                {/* Computed Properties */}
                <div className="mb-6">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Info size={12} />
                    Computed Properties
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-gray-900/30 rounded border border-gray-800">
                      <div className="text-xs text-gray-500">Overdue</div>
                      <div className={`text-sm font-medium ${selectedTask.isOverdue ? 'text-orange-400' : 'text-gray-400'}`}>
                        {selectedTask.isOverdue ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-900/30 rounded border border-gray-800">
                      <div className="text-xs text-gray-500">High Priority</div>
                      <div className={`text-sm font-medium ${selectedTask.isHighPriority ? 'text-rose-400' : 'text-gray-400'}`}>
                        {selectedTask.isHighPriority ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-900/30 rounded border border-gray-800">
                      <div className="text-xs text-gray-500">Assigned User</div>
                      <div className="text-sm font-medium text-gray-300 truncate">
                        {selectedTask.assignedUser}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Command Execution */}
                <div className="mb-6">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Execute Command</h4>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={selectedCommand}
                        onChange={(e) => setSelectedCommand(e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 focus:outline-none focus:border-sky-500"
                      >
                        <option value="setTimestamp">setTimestamp - Set creation time</option>
                        <option value="updateStatus">updateStatus - Change status</option>
                        <option value="assignTask">assignTask - Assign user</option>
                      </select>
                    </div>
                    {selectedCommand === 'updateStatus' && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Parameters (JSON)</label>
                        <input
                          type="text"
                          value={commandParams}
                          onChange={(e) => setCommandParams(e.target.value)}
                          placeholder='{"newStatus": "in-progress"}'
                          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          Valid statuses: <code className="text-gray-400">todo</code>, <code className="text-gray-400">in-progress</code>, <code className="text-gray-400">done</code>
                        </div>
                      </div>
                    )}
                    {selectedCommand === 'assignTask' && (
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Parameters (JSON)</label>
                        <input
                          type="text"
                          value={commandParams}
                          onChange={(e) => setCommandParams(e.target.value)}
                          placeholder='{"userId": "user-123"}'
                          className="w-full px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs font-mono text-gray-300 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    )}
                    <button
                      onClick={handleExecuteCommand}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors"
                    >
                      <Play size={14} />
                      Execute Command
                    </button>
                  </div>
                </div>

                {/* Command Result */}
                {error && (
                  <div className="mb-4 p-3 bg-rose-900/20 rounded border border-rose-800/50 flex items-start gap-2">
                    <AlertCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-rose-300">{error}</div>
                  </div>
                )}

                {commandResult && (
                  <div className="mb-4 p-3 rounded border bg-gray-900/50">
                    <div className={`p-3 rounded border ${
                      commandResult.success
                        ? 'bg-emerald-900/20 border-emerald-800/50'
                        : 'bg-rose-900/20 border-rose-800/50'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        {commandResult.success ? (
                          <CheckCircle size={16} className="text-emerald-400" />
                        ) : (
                          <AlertCircle size={16} className="text-rose-400" />
                        )}
                        <span className={`text-sm font-medium ${
                          commandResult.success ? 'text-emerald-300' : 'text-rose-300'
                        }`}>
                          {commandResult.success ? 'Success' : 'Failed'}
                        </span>
                      </div>

                      {commandResult.error && (
                        <div className="text-sm text-rose-300 mb-2">{commandResult.error}</div>
                      )}

                      {commandResult.guardFailure && formatGuardFailure(commandResult.guardFailure)}

                      {commandResult.policyDenial && formatPolicyDenial(commandResult.policyDenial)}

                      {commandResult.emittedEvents.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-gray-400 mb-1">Emitted Events:</div>
                          {commandResult.emittedEvents.map((event, i) => (
                            <div key={i} className="text-xs font-mono text-emerald-300 bg-gray-900/50 p-2 rounded mt-1">
                              {event.name} ({event.channel})
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a task to view details
            </div>
          )}
        </div>

        {/* Event Log Sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-gray-800 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-purple-400" />
              <span className="text-xs text-gray-500 uppercase tracking-wider">Event Log</span>
              {eventLog.length > 0 && (
                <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                  {eventLog.length}
                </span>
              )}
            </div>
            {eventLog.length > 0 && (
              <button
                onClick={handleClearEventLog}
                className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div className="p-2 space-y-2">
            {eventLog.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No events yet
              </div>
            ) : (
              eventLog.slice().reverse().map((event, index) => (
                <div
                  key={index}
                  className="p-2 bg-gray-900/50 rounded border border-gray-800 hover:border-purple-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-purple-300">{event.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
