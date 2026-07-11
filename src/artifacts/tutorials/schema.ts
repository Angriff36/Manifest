/**
 * Tutorial JSON Schema for community contributions.
 *
 * This is the contract that community-contributed tutorials must follow.
 * Contributors can write a tutorial as a JSON file following this schema
 * and it can be loaded at runtime.
 *
 * Schema: docs/spec/tutorials/tutorial-v1.schema.json
 */
import type { Tutorial } from './types';

export const TUTORIAL_SCHEMA_VERSION = '1.0';

/** Validate a community-contributed tutorial JSON against the schema */
export function validateTutorialJson(data: unknown): {
  valid: boolean;
  errors: string[];
  tutorial?: Tutorial;
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Tutorial must be an object'] };
  }

  const t = data as Record<string, unknown>;

  // Required fields
  for (const field of [
    'id',
    'title',
    'description',
    'difficulty',
    'estimatedMinutes',
    'author',
    'tags',
    'steps',
  ]) {
    if (!(field in t)) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  // Type checks
  if (typeof t.id !== 'string') errors.push('"id" must be a string');
  if (typeof t.title !== 'string') errors.push('"title" must be a string');
  if (typeof t.description !== 'string') errors.push('"description" must be a string');
  if (typeof t.author !== 'string') errors.push('"author" must be a string');
  if (typeof t.estimatedMinutes !== 'number') errors.push('"estimatedMinutes" must be a number');
  if (!Array.isArray(t.tags)) errors.push('"tags" must be an array of strings');
  if (!Array.isArray(t.steps)) errors.push('"steps" must be an array');

  // Difficulty enum
  if (t.difficulty && !['beginner', 'intermediate', 'advanced'].includes(t.difficulty as string)) {
    errors.push('"difficulty" must be "beginner", "intermediate", or "advanced"');
  }

  // Steps validation
  if (Array.isArray(t.steps)) {
    const stepIds = new Set<string>();
    t.steps.forEach((step: unknown, i: number) => {
      const stepErrors = validateStepShape(step, i);
      errors.push(...stepErrors);
      if (
        step &&
        typeof step === 'object' &&
        typeof (step as Record<string, unknown>).id === 'string'
      ) {
        const stepId = (step as Record<string, unknown>).id as string;
        if (stepIds.has(stepId)) {
          errors.push(`Step ${i}: duplicate step id "${stepId}"`);
        }
        stepIds.add(stepId);
      }
    });
  }

  // Prerequisites
  if (t.prerequisites !== undefined) {
    if (!Array.isArray(t.prerequisites)) {
      errors.push('"prerequisites" must be an array of strings');
    } else {
      for (const p of t.prerequisites) {
        if (typeof p !== 'string') {
          errors.push('"prerequisites" entries must be strings');
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, errors: [], tutorial: t as unknown as Tutorial };
}

function validateStepShape(step: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!step || typeof step !== 'object') {
    errors.push(`Step ${index}: must be an object`);
    return errors;
  }
  const s = step as Record<string, unknown>;

  for (const field of [
    'id',
    'title',
    'instruction',
    'starterCode',
    'expectedCode',
    'hints',
    'validation',
  ]) {
    if (!(field in s)) {
      errors.push(`Step ${index}: missing required field "${field}"`);
    }
  }

  if (typeof s.id !== 'string') errors.push(`Step ${index}: "id" must be a string`);
  if (typeof s.title !== 'string') errors.push(`Step ${index}: "title" must be a string`);
  if (typeof s.instruction !== 'string')
    errors.push(`Step ${index}: "instruction" must be a string`);
  if (typeof s.starterCode !== 'string')
    errors.push(`Step ${index}: "starterCode" must be a string`);
  if (typeof s.expectedCode !== 'string')
    errors.push(`Step ${index}: "expectedCode" must be a string`);

  if (!Array.isArray(s.hints)) {
    errors.push(`Step ${index}: "hints" must be an array`);
  } else {
    s.hints.forEach((hint: unknown, hi: number) => {
      const hintErrors = validateHintShape(hint, index, hi);
      errors.push(...hintErrors);
    });
  }

  if (!Array.isArray(s.validation)) {
    errors.push(`Step ${index}: "validation" must be an array`);
  } else {
    s.validation.forEach((rule: unknown, vi: number) => {
      const ruleErrors = validateRuleShape(rule, index, vi);
      errors.push(...ruleErrors);
    });
  }

  if (s.unlocks !== undefined && !Array.isArray(s.unlocks)) {
    errors.push(`Step ${index}: "unlocks" must be an array of strings`);
  }

  return errors;
}

function validateHintShape(hint: unknown, stepIndex: number, hintIndex: number): string[] {
  const errors: string[] = [];
  if (!hint || typeof hint !== 'object') {
    errors.push(`Step ${stepIndex} hint ${hintIndex}: must be an object`);
    return errors;
  }
  const h = hint as Record<string, unknown>;
  if (typeof h.text !== 'string') {
    errors.push(`Step ${stepIndex} hint ${hintIndex}: "text" must be a string`);
  }
  if (h.afterFailures !== undefined && typeof h.afterFailures !== 'number') {
    errors.push(`Step ${stepIndex} hint ${hintIndex}: "afterFailures" must be a number`);
  }
  return errors;
}

function validateRuleShape(rule: unknown, stepIndex: number, ruleIndex: number): string[] {
  const errors: string[] = [];
  if (!rule || typeof rule !== 'object') {
    errors.push(`Step ${stepIndex} rule ${ruleIndex}: must be an object`);
    return errors;
  }
  const r = rule as Record<string, unknown>;
  const validTypes = [
    'compiles',
    'has-entity',
    'has-property',
    'has-command',
    'has-guard',
    'has-computed',
    'has-policy',
    'source-contains',
    'source-matches',
    'ir-has',
  ];
  if (typeof r.type !== 'string' || !validTypes.includes(r.type)) {
    errors.push(
      `Step ${stepIndex} rule ${ruleIndex}: "type" must be one of: ${validTypes.join(', ')}`,
    );
  }
  return errors;
}

/** JSON Schema (for documentation/external validation tools) */
export const TUTORIAL_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://manifest-lang.org/schemas/tutorial-v1.schema.json',
  title: 'Manifest Tutorial',
  description: 'A structured tutorial for learning Manifest',
  type: 'object',
  required: [
    'id',
    'title',
    'description',
    'difficulty',
    'estimatedMinutes',
    'author',
    'tags',
    'steps',
  ],
  properties: {
    id: { type: 'string', description: 'Unique identifier' },
    title: { type: 'string' },
    description: { type: 'string' },
    difficulty: { enum: ['beginner', 'intermediate', 'advanced'] },
    estimatedMinutes: { type: 'number', minimum: 1 },
    author: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    prerequisites: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'title',
          'instruction',
          'starterCode',
          'expectedCode',
          'hints',
          'validation',
        ],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          instruction: { type: 'string' },
          starterCode: { type: 'string' },
          expectedCode: { type: 'string' },
          optional: { type: 'boolean' },
          unlocks: { type: 'array', items: { type: 'string' } },
          hints: {
            type: 'array',
            items: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string' },
                afterFailures: { type: 'number' },
                final: { type: 'boolean' },
              },
            },
          },
          validation: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  enum: [
                    'compiles',
                    'has-entity',
                    'has-property',
                    'has-command',
                    'has-guard',
                    'has-computed',
                    'has-policy',
                    'source-contains',
                    'source-matches',
                    'ir-has',
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
};
