import type { TestScript, ValidationResult } from '../types/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSeedEntity(entry: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isRecord(entry)) {
    errors.push(`seedEntities[${index}] must be an object`);
    return errors;
  }
  if (typeof entry.entity !== 'string' || entry.entity.length === 0) {
    errors.push(`seedEntities[${index}].entity must be a non-empty string`);
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    errors.push(`seedEntities[${index}].id must be a non-empty string`);
  }
  if (!isRecord(entry.properties)) {
    errors.push(`seedEntities[${index}].properties must be an object`);
  }
  return errors;
}

function validateExpectation(expect: unknown, stepIndex: number): string[] {
  const errors: string[] = [];
  if (!isRecord(expect)) {
    errors.push(`commands[${stepIndex}].expect must be an object`);
    return errors;
  }
  if (typeof expect.success !== 'boolean') {
    errors.push(`commands[${stepIndex}].expect.success must be a boolean`);
  }
  if (expect.error !== undefined) {
    if (!isRecord(expect.error)) {
      errors.push(`commands[${stepIndex}].expect.error must be an object`);
    } else {
      const validTypes = ['guard', 'policy', 'constraint'];
      if (typeof expect.error.type !== 'string' || !validTypes.includes(expect.error.type)) {
        errors.push(`commands[${stepIndex}].expect.error.type must be one of: ${validTypes.join(', ')}`);
      }
    }
  }
  if (expect.stateAfter !== undefined && !isRecord(expect.stateAfter)) {
    errors.push(`commands[${stepIndex}].expect.stateAfter must be an object`);
  }
  if (expect.emittedEvents !== undefined && !Array.isArray(expect.emittedEvents)) {
    errors.push(`commands[${stepIndex}].expect.emittedEvents must be an array`);
  }
  if (expect.constraintWarnings !== undefined && !Array.isArray(expect.constraintWarnings)) {
    errors.push(`commands[${stepIndex}].expect.constraintWarnings must be an array`);
  }
  return errors;
}

function validateCommand(cmd: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isRecord(cmd)) {
    errors.push(`commands[${index}] must be an object`);
    return errors;
  }
  if (typeof cmd.step !== 'number' || !Number.isInteger(cmd.step)) {
    errors.push(`commands[${index}].step must be an integer`);
  }
  if (typeof cmd.entity !== 'string' || cmd.entity.length === 0) {
    errors.push(`commands[${index}].entity must be a non-empty string`);
  }
  if (typeof cmd.id !== 'string' || cmd.id.length === 0) {
    errors.push(`commands[${index}].id must be a non-empty string`);
  }
  if (typeof cmd.command !== 'string' || cmd.command.length === 0) {
    errors.push(`commands[${index}].command must be a non-empty string`);
  }
  if (cmd.params !== undefined && !isRecord(cmd.params)) {
    errors.push(`commands[${index}].params must be an object if provided`);
  }
  if (cmd.expect === undefined) {
    errors.push(`commands[${index}].expect is required`);
  } else {
    errors.push(...validateExpectation(cmd.expect, index));
  }
  return errors;
}

export function validateScript(script: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(script)) {
    return { valid: false, errors: ['Script must be an object'] };
  }

  if (typeof script.description !== 'string' || script.description.length === 0) {
    errors.push('description must be a non-empty string');
  }

  if (script.context !== undefined && !isRecord(script.context)) {
    errors.push('context must be an object if provided');
  }

  if (script.seedEntities !== undefined) {
    if (!Array.isArray(script.seedEntities)) {
      errors.push('seedEntities must be an array if provided');
    } else {
      for (let i = 0; i < script.seedEntities.length; i++) {
        errors.push(...validateSeedEntity(script.seedEntities[i], i));
      }
    }
  }

  if (!Array.isArray(script.commands)) {
    errors.push('commands must be an array');
  } else if (script.commands.length === 0) {
    errors.push('commands must not be empty');
  } else {
    for (let i = 0; i < script.commands.length; i++) {
      errors.push(...validateCommand(script.commands[i], i));
    }
  }

  return { valid: errors.length === 0, errors };
}
