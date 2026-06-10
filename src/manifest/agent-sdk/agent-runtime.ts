/**
 * AgentRuntime — LLM-friendly wrapper around RuntimeEngine.
 * Handles tool call routing, result formatting, and built-in introspection.
 */

import type { RuntimeEngine, CommandResult } from '../runtime-engine';
import type { IR } from '../ir';
import type {
  ToolFormat,
  AgentToolCall,
  AgentToolResult,
  AgentRuntimeOptions,
  BuiltinToolNames,
} from './types';
import { toAnthropicTools, toOpenAITools, toVercelAITools, getBuiltinToolNames } from './tool-definitions.js';
import { listEntities, describeEntity, listCommands, describeCommand, formatExpression } from './introspect.js';
import { findMatchingCommands } from './intent-mapper.js';

// ------------------------------------------------------------------------------------------------
// AgentRuntime
// ------------------------------------------------------------------------------------------------

export class AgentRuntime {
  private readonly engine: RuntimeEngine;
  private readonly options: Required<AgentRuntimeOptions>;
  readonly ir: IR;
  readonly builtinToolNames: BuiltinToolNames;

  constructor(engine: RuntimeEngine, options: AgentRuntimeOptions = {}) {
    this.engine = engine;
    this.options = {
      builtinPrefix: options.builtinPrefix ?? 'manifest',
      toolNameStrategy: options.toolNameStrategy ?? 'snake',
    };
    this.ir = engine.getIR();
    this.builtinToolNames = getBuiltinToolNames(this.options.builtinPrefix);
  }

  // ------------------------------------------------------------------------------------------------
  // Tool Definitions
  // ------------------------------------------------------------------------------------------------

  getToolDefinitions(format: ToolFormat) {
    switch (format) {
      case 'anthropic':
        return toAnthropicTools(this.ir, { ...this.options, includeBuiltins: true });
      case 'openai':
        return toOpenAITools(this.ir, { ...this.options, includeBuiltins: true });
      case 'vercel':
        return toVercelAITools(this.ir, { ...this.options, includeBuiltins: true });
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Tool Call Execution
  // ------------------------------------------------------------------------------------------------

  async executeToolCall(call: AgentToolCall): Promise<AgentToolResult> {
    const { name, arguments: args } = call;

    // Route to built-in or user command
    if (name in this.builtinToolNames) {
      return this.executeBuiltin(name, args);
    }

    // Unknown tool: command not in builtins and not in IR commands
    const commandExists = this.ir.commands.some(
      (c) => c.name === name || `${c.entity?.toLowerCase()}_${c.name}` === name
    );
    if (!commandExists) {
      return { success: false, code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
    }

    // User command — try mangled name first, then raw name
    return this.executeCommand(name, args);
  }

  private async executeBuiltin(name: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    const tool = this.builtinToolNames[name as keyof BuiltinToolNames];
    if (!tool) {
      return {
        success: false,
        code: 'UNKNOWN_TOOL',
        message: `Unknown tool: ${name}`,
      };
    }

    switch (tool) {
      case this.builtinToolNames.LIST_ENTITIES: {
        const module = args.module as string | undefined;
        const entities = listEntities(this.ir).filter((e) => !module || e.module === module);
        return { success: true, code: 'SUCCESS', message: `${entities.length} entities found`, data: entities };
      }

      case this.builtinToolNames.DESCRIBE_ENTITY: {
        const name_ = args.name as string;
        if (!name_) return { success: false, code: 'MISSING_ARGUMENT', message: 'Missing required argument: name' };
        const details = describeEntity(this.ir, name_);
        if (!details) return { success: false, code: 'ENTITY_NOT_FOUND', message: `Entity not found: ${name_}` };
        return { success: true, code: 'SUCCESS', message: `Entity: ${name_}`, data: details };
      }

      case this.builtinToolNames.LIST_COMMANDS: {
        const entity = args.entity as string | undefined;
        const module = args.module as string | undefined;
        const cmds = listCommands(this.ir, { entity, module });
        return { success: true, code: 'SUCCESS', message: `${cmds.length} commands found`, data: cmds };
      }

      case this.builtinToolNames.DESCRIBE_COMMAND: {
        const name_ = args.name as string;
        if (!name_) return { success: false, code: 'MISSING_ARGUMENT', message: 'Missing required argument: name' };
        const details = describeCommand(this.ir, name_);
        if (!details) return { success: false, code: 'COMMAND_NOT_FOUND', message: `Command not found: ${name_}` };
        return { success: true, code: 'SUCCESS', message: `Command: ${name_}`, data: details };
      }

      case this.builtinToolNames.EXECUTE_COMMAND: {
        const { command, entityId, parameters = {}, context = {} } = args as {
          command?: string;
          entityId?: string;
          parameters?: Record<string, unknown>;
          context?: Record<string, unknown>;
        };
        if (!command) return { success: false, code: 'MISSING_ARGUMENT', message: 'Missing required argument: command' };
        // runCommand signature: (name, input, options?)
        const result = await this.engine.runCommand(command, { ...parameters, ...(entityId ? { entityId } : {}) }, {
          ...(entityId ? { instanceId: entityId } : {}),
          ...(context ? { causationId: (context as any).causationId } : {}),
        });
        return this.formatResultForLLM(result);
      }

      case this.builtinToolNames.GET_INSTANCES: {
        const { entity, limit = 20 } = args as { entity?: string; limit?: number };
        if (!entity) return { success: false, code: 'MISSING_ARGUMENT', message: 'Missing required argument: entity' };
        const instances = await this.engine.getAllInstances(entity as any);
        return { success: true, code: 'SUCCESS', message: `${instances.length} instances found`, data: instances.slice(0, limit as number) };
      }

      case this.builtinToolNames.CHECK_CONSTRAINTS: {
        const { entity, entityId, constraintCodes } = args as {
          entity?: string;
          entityId?: string;
          constraintCodes?: string[];
        };
        if (!entity || !entityId) {
          return { success: false, code: 'MISSING_ARGUMENT', message: 'Missing required arguments: entity, entityId' };
        }
        const inst = await this.engine.getInstance(entity as any, entityId as any);
        if (!inst) return { success: false, code: 'INSTANCE_NOT_FOUND', message: `Instance not found: ${entityId}` };
        const entityDef = this.ir.entities.find((e) => e.name === entity);
        if (!entityDef) return { success: false, code: 'ENTITY_NOT_FOUND', message: `Entity not found: ${entity}` };
        const constraintOutcomes = (entityDef.constraints ?? [])
          .filter((c) => !constraintCodes || constraintCodes.length === 0 || constraintCodes.includes(c.code))
          .map((c) => ({ code: c.code, constraintName: c.name, severity: c.severity ?? 'block', passed: false }));
        return { success: true, code: 'SUCCESS', message: 'Constraint check complete', data: constraintOutcomes };
      }

      default:
        return { success: false, code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}` };
    }
  }

  private async executeCommand(commandName: string, args: Record<string, unknown>): Promise<AgentToolResult> {
    const { entityId, parameters = {}, context = {} } = args as {
      entityId?: string;
      parameters?: Record<string, unknown>;
      context?: Record<string, unknown>;
    };

    // Try to resolve the actual command name (may be mangled as entity_command or raw)
    const cmd = this.ir.commands.find(
      (c) => c.name === commandName || `${c.entity?.toLowerCase()}_${c.name}` === commandName
    );
    const resolvedName = cmd?.name ?? commandName;

    // runCommand signature: (commandName, input, options?)
    const result = await this.engine.runCommand(
      resolvedName,
      { ...(parameters as Record<string, unknown>), ...(entityId ? { entityId } : {}) },
      {
        ...(entityId ? { instanceId: entityId } : {}),
        ...(context ? { causationId: (context as any).causationId } : {}),
      }
    );

    return this.formatResultForLLM(result);
  }

  // ------------------------------------------------------------------------------------------------
  // Convenience introspection helpers
  // ------------------------------------------------------------------------------------------------

  listEntities(opts?: { module?: string }) {
    return listEntities(this.ir).filter((e) => !opts?.module || e.module === opts.module);
  }

  describeEntity(name: string) {
    return describeEntity(this.ir, name);
  }

  listCommands(opts?: { entity?: string; module?: string }) {
    return listCommands(this.ir, opts);
  }

  describeCommand(name: string) {
    return describeCommand(this.ir, name);
  }

  findCommands(intent: string) {
    return findMatchingCommands(this.ir, intent);
  }

  // ------------------------------------------------------------------------------------------------
  // Result formatting
  // ------------------------------------------------------------------------------------------------

  private formatResultForLLM(result: CommandResult): AgentToolResult {
    if (result.success) {
      return {
        success: true,
        code: 'SUCCESS',
        message: 'Command executed successfully',
        data: result.result,
        emittedEvents: result.emittedEvents.map((e) => e.name),
      };
    }

    if (result.guardFailure) {
      return {
        success: false,
        code: 'GUARD_FAILED',
        message: `Guard ${result.guardFailure.index + 1} evaluated to false`,
        guardFailure: {
          index: result.guardFailure.index,
          expression: formatExpression(result.guardFailure.expression),
          resolved: result.guardFailure.resolved ?? [],
        },
      };
    }

    if (result.policyDenial) {
      return {
        success: false,
        code: 'POLICY_DENIED',
        message: result.policyDenial.message ?? 'Policy denied execution',
        policyDenial: {
          policy: result.policyDenial.policyName ?? 'unknown',
          expression: formatExpression(result.policyDenial.expression),
        },
      };
    }

    if (result.concurrencyConflict) {
      return {
        success: false,
        code: 'CONCURRENCY_CONFLICT',
        message: 'Concurrent modification detected',
        concurrencyConflict: {
          entityType: result.concurrencyConflict.entityType,
          entityId: result.concurrencyConflict.entityId,
          expectedVersion: result.concurrencyConflict.expectedVersion,
          actualVersion: result.concurrencyConflict.actualVersion,
        },
      };
    }

    if (result.constraintOutcomes && result.constraintOutcomes.some((c) => c.severity === 'block' && !c.passed)) {
      return {
        success: false,
        code: 'CONSTRAINT_BLOCKED',
        message: 'One or more constraints were violated',
        constraintOutcomes: result.constraintOutcomes.map((c) => ({
          code: c.code,
          constraintName: c.constraintName,
          severity: c.severity ?? 'block',
          passed: c.passed,
          overridden: c.overridden,
        })),
      };
    }

    return {
      success: false,
      code: 'EXECUTION_ERROR',
      message: result.error ?? 'Command execution failed',
    };
  }
}
