import type { TestScript } from '../types/index.js';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function validateString(value: unknown, path: string): ValidationError[] {
  if (typeof value !== 'string' || value.length === 0) {
    return [{ path, message: 'must be a non-empty string' }];
  }
  return [];
}

function validateBoolean(value: unknown, path: string): ValidationError[] {
  if (typeof value !== 'boolean') {
    return [{ path, message: 'must be a boolean' }];
  }
  return [];
}

function validateNumber(value: unknown, path: string): ValidationError[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [{ path, message: 'must be a finite number' }];
  }
  return [];
}

function validateObject(value: unknown, path: string): ValidationError[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path, message: 'must be an object' }];
  }
  return [];
}

function validateCommandExpect(expect: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  errors.push(...validateObject(expect, path));
  if (errors.length > 0) return errors;

  const exp = expect as Record<string, unknown>;
  errors.push(...validateBoolean(exp['success'], `${path}.success`));

  if (exp['error'] !== undefined) {
    const errPath = `${path}.error`;
    errors.push(...validateObject(exp['error'], errPath));
    if (typeof exp['error'] === 'object' && exp['error'] !== null) {
      const err = exp['error'] as Record<string, unknown>;
      if (!['guard', 'policy', 'constraint'].includes(err['type'] as string)) {
        errors.push({ path: `${errPath}.type`, message: 'must be "guard", "policy", or "constraint"' });
      }
    }
  }

  if (exp['emittedEvents'] !== undefined && !Array.isArray(exp['emittedEvents'])) {
    errors.push({ path: `${path}.emittedEvents`, message: 'must be an array' });
  }

  if (exp['constraintWarnings'] !== undefined && !Array.isArray(exp['constraintWarnings'])) {
    errors.push({ path: `${path}.constraintWarnings`, message: 'must be an array' });
  }

  return errors;
}

function validateCommand(cmd: unknown, index: number): ValidationError[] {
  const path = `commands[${index}]`;
  const errors: ValidationError[] = [];

  errors.push(...validateObject(cmd, path));
  if (errors.length > 0) return errors;

  const c = cmd as Record<string, unknown>;
  errors.push(...validateNumber(c['step'], `${path}.step`));
  errors.push(...validateString(c['entity'], `${path}.entity`));
  errors.push(...validateString(c['id'], `${path}.id`));
  errors.push(...validateString(c['command'], `${path}.command`));
  errors.push(...validateCommandExpect(c['expect'], `${path}.expect`));

  return errors;
}

function validateSeedEntity(entity: unknown, index: number): ValidationError[] {
  const path = `seedEntities[${index}]`;
  const errors: ValidationError[] = [];

  errors.push(...validateObject(entity, path));
  if (errors.length > 0) return errors;

  const e = entity as Record<string, unknown>;
  errors.push(...validateString(e['entity'], `${path}.entity`));
  errors.push(...validateString(e['id'], `${path}.id`));
  errors.push(...validateObject(e['properties'], `${path}.properties`));

  return errors;
}

export function validateScript(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  errors.push(...validateObject(input, 'script'));
  if (errors.length > 0) return { valid: false, errors };

  const script = input as Record<string, unknown>;
  errors.push(...validateString(script['description'], 'description'));

  if (!Array.isArray(script['commands'])) {
    errors.push({ path: 'commands', message: 'must be an array' });
  } else {
    script['commands'].forEach((cmd, i) => {
      errors.push(...validateCommand(cmd, i));
    });
  }

  if (script['seedEntities'] !== undefined) {
    if (!Array.isArray(script['seedEntities'])) {
      errors.push({ path: 'seedEntities', message: 'must be an array' });
    } else {
      script['seedEntities'].forEach((entity, i) => {
        errors.push(...validateSeedEntity(entity, i));
      });
    }
  }

  if (script['context'] !== undefined) {
    errors.push(...validateObject(script['context'], 'context'));
  }

  return { valid: errors.length === 0, errors };
}

export function parseScript(input: unknown): TestScript {
  const result = validateScript(input);
  if (!result.valid) {
    const messages = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Invalid test script:\n${messages}`);
  }
  return input as TestScript;
}
