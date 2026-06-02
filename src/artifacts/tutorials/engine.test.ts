import { describe, it, expect } from 'vitest';
import { validateStep, getNextStep, getProgressPercent } from './engine';
import { validateTutorialJson } from './schema';
import { BUILTIN_TUTORIALS } from './builtin';
import type { TutorialStep } from './types';

// Valid Manifest syntax uses `property name: type` inside entities.
// Example: `entity Task { property title: string }`

describe('tutorial engine', () => {
  describe('validateStep', () => {
    it('passes when source compiles and meets requirements', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'Create a Task entity',
        starterCode: '',
        expectedCode: 'entity Task {}',
        hints: [],
        validation: [
          { type: 'compiles' },
          { type: 'has-entity', name: 'Task' },
        ],
      };
      const result = await validateStep(step, 'entity Task {}');
      expect(result.passed).toBe(true);
      expect(result.checks).toHaveLength(2);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it('fails on compilation error', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [{ type: 'compiles' }],
      };
      const result = await validateStep(step, 'entity { }'); // missing name
      expect(result.passed).toBe(false);
      expect(result.compileError).toBeDefined();
    });

    it('validates has-entity rule', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [{ type: 'has-entity', name: 'User' }],
      };
      const passResult = await validateStep(step, 'entity User {}');
      expect(passResult.passed).toBe(true);

      const failResult = await validateStep(step, 'entity Task {}');
      expect(failResult.passed).toBe(false);
      expect(failResult.checks[0].passed).toBe(false);
    });

    it('validates has-property rule with type', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [
          { type: 'has-property', entity: 'Task', property: 'title', typeName: 'string' },
        ],
      };
      const passResult = await validateStep(step, 'entity Task { property title: string }');
      expect(passResult.passed).toBe(true);

      const failResult = await validateStep(step, 'entity Task { property title: number }');
      expect(failResult.passed).toBe(false);
    });

    it('validates source-contains rule', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [{ type: 'source-contains', text: 'computed' }],
      };
      const passResult = await validateStep(
        step,
        'entity Task { computed total: number = 1 }'
      );
      expect(passResult.passed).toBe(true);

      const failResult = await validateStep(step, 'entity Task {}');
      expect(failResult.passed).toBe(false);
    });

    it('validates source-matches rule', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [{ type: 'source-matches', pattern: 'entity\\s+\\w+\\s*\\{' }],
      };
      const passResult = await validateStep(step, 'entity Task {}');
      expect(passResult.passed).toBe(true);
    });

    it('validates has-command rule', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [{ type: 'has-command', name: 'doSomething' }],
      };
      const passResult = await validateStep(
        step,
        'entity Task { command doSomething() {} }'
      );
      expect(passResult.passed).toBe(true);
    });

    it('returns correct message for partial pass', async () => {
      const step: TutorialStep = {
        id: 'test',
        title: 'Test',
        instruction: 'test',
        starterCode: '',
        expectedCode: '',
        hints: [],
        validation: [
          { type: 'has-entity', name: 'A' },
          { type: 'has-entity', name: 'B' },
        ],
      };
      const result = await validateStep(step, 'entity A {}');
      expect(result.passed).toBe(false);
      expect(result.message).toContain('1/2');
    });
  });

  describe('getNextStep', () => {
    it('returns first incomplete step', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      const completed = [tutorial.steps[0].id];
      const next = getNextStep(tutorial, completed);
      expect(next?.id).toBe(tutorial.steps[1].id);
    });

    it('returns null when all steps complete', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      const completed = tutorial.steps.map((s) => s.id);
      const next = getNextStep(tutorial, completed);
      expect(next).toBeNull();
    });

    it('returns first step when nothing completed', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      const next = getNextStep(tutorial, []);
      expect(next?.id).toBe(tutorial.steps[0].id);
    });
  });

  describe('getProgressPercent', () => {
    it('returns 0 for no progress', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      expect(getProgressPercent(tutorial, [])).toBe(0);
    });

    it('returns 100 when all complete', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      const completed = tutorial.steps.map((s) => s.id);
      expect(getProgressPercent(tutorial, completed)).toBe(100);
    });

    it('returns partial percentage', () => {
      const tutorial = BUILTIN_TUTORIALS[0];
      const completed = [tutorial.steps[0].id];
      const total = tutorial.steps.length;
      const expected = Math.round((1 / total) * 100);
      expect(getProgressPercent(tutorial, completed)).toBe(expected);
    });

    it('handles empty tutorial', () => {
      expect(getProgressPercent({ ...BUILTIN_TUTORIALS[0], steps: [] }, [])).toBe(0);
    });
  });
});

describe('tutorial schema validation', () => {
  it('accepts a valid tutorial', () => {
    const tutorial = BUILTIN_TUTORIALS[0];
    const result = validateTutorialJson(tutorial);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects tutorial missing required fields', () => {
    const result = validateTutorialJson({ id: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid difficulty', () => {
    const tutorial = { ...BUILTIN_TUTORIALS[0], difficulty: 'expert' };
    const result = validateTutorialJson(tutorial);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('difficulty'))).toBe(true);
  });

  it('rejects tutorial with non-object', () => {
    const result = validateTutorialJson('not a tutorial');
    expect(result.valid).toBe(false);
  });

  it('rejects step missing required fields', () => {
    const bad = {
      ...BUILTIN_TUTORIALS[0],
      steps: [{ id: 's1' }], // missing many required fields
    };
    const result = validateTutorialJson(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate step IDs', () => {
    const bad = {
      ...BUILTIN_TUTORIALS[0],
      steps: BUILTIN_TUTORIALS[0].steps.map((s) => ({ ...s, id: 'dup' })),
    };
    const result = validateTutorialJson(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('rejects invalid validation rule type', () => {
    const bad = {
      ...BUILTIN_TUTORIALS[0],
      steps: [
        {
          ...BUILTIN_TUTORIALS[0].steps[0],
          validation: [{ type: 'invalid-type' }],
        },
      ],
    };
    const result = validateTutorialJson(bad);
    expect(result.valid).toBe(false);
  });
});

describe('built-in tutorials', () => {
  it('has at least one tutorial', () => {
    expect(BUILTIN_TUTORIALS.length).toBeGreaterThan(0);
  });

  it('all built-in tutorials are valid', () => {
    for (const tutorial of BUILTIN_TUTORIALS) {
      const result = validateTutorialJson(tutorial);
      expect(result.valid, `Tutorial "${tutorial.id}" is invalid: ${result.errors.join('; ')}`).toBe(true);
    }
  });

  it('all built-in tutorials have unique IDs', () => {
    const ids = BUILTIN_TUTORIALS.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('first-program tutorial starts with entity step', () => {
    const tutorial = BUILTIN_TUTORIALS.find((t) => t.id === 'first-program');
    expect(tutorial).toBeDefined();
    expect(tutorial!.steps[0].id).toBe('hello-entity');
  });

  it('tutorials with prerequisites reference existing tutorials', () => {
    const allIds = new Set(BUILTIN_TUTORIALS.map((t) => t.id));
    for (const tutorial of BUILTIN_TUTORIALS) {
      if (tutorial.prerequisites) {
        for (const prereq of tutorial.prerequisites) {
          expect(allIds.has(prereq), `Tutorial "${tutorial.id}" has unknown prerequisite "${prereq}"`).toBe(true);
        }
      }
    }
  });
});
