/**
 * Invocation extractor — command-arg literal recovery must not invent
 * capabilities from FormData field names or object-literal noise.
 * Object-literal key scanning must recognize ES property shorthand.
 */

import { describe, it, expect } from 'vitest';
import {
  extractAllManifestInvocations,
  extractGeneratedClientCalls,
} from './invocation-extractor.js';
import {
  extractObjectFieldNames,
  objectLiteralHasKey,
  readObjectLiteralFieldExpression,
} from './object-literal-keys.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('extractObjectFieldNames — ES property shorthand', () => {
  it('1. detects colon property', () => {
    expect(extractObjectFieldNames('{ title: value }')).toEqual(['title']);
  });

  it('2. detects one shorthand property', () => {
    expect(extractObjectFieldNames('{ dropOff }')).toEqual(['dropOff']);
  });

  it('3. detects multiple shorthand properties', () => {
    expect(extractObjectFieldNames('{ dropOff, bringHot }')).toEqual([
      'dropOff',
      'bringHot',
    ]);
  });

  it('4. detects mixed explicit + shorthand', () => {
    expect(
      extractObjectFieldNames(
        '{ id: recipeVersionId, dropOff, bringHot, cookOnSite }',
      ),
    ).toEqual(['id', 'dropOff', 'bringHot', 'cookOnSite']);
  });

  it('5. detects multiline shorthand properties', () => {
    expect(
      extractObjectFieldNames(`{
          dropOff,
          bringHot,
          cookOnSite,
        }`),
    ).toEqual(['dropOff', 'bringHot', 'cookOnSite']);
  });

  it('6. detects shorthand immediately before }', () => {
    expect(objectLiteralHasKey('{ dropOff }', 'dropOff')).toBe(true);
    expect(extractObjectFieldNames('{ a, b }')).toEqual(['a', 'b']);
  });

  it('7. does not treat identifier inside function call as a key', () => {
    expect(extractObjectFieldNames('{ value: fn(dropOff) }')).toEqual(['value']);
    expect(objectLiteralHasKey('{ value: fn(dropOff) }', 'dropOff')).toBe(false);
  });

  it('8. does not treat identifier inside ternary as a key', () => {
    expect(
      extractObjectFieldNames('{ value: condition ? dropOff : bringHot }'),
    ).toEqual(['value']);
    expect(
      objectLiteralHasKey(
        '{ value: condition ? dropOff : bringHot }',
        'dropOff',
      ),
    ).toBe(false);
    expect(
      objectLiteralHasKey(
        '{ value: condition ? dropOff : bringHot }',
        'bringHot',
      ),
    ).toBe(false);
  });

  it('9. shorthand field expression resolves to its identifier', () => {
    expect(readObjectLiteralFieldExpression('{ dropOff }', 'dropOff')).toBe(
      'dropOff',
    );
    expect(
      readObjectLiteralFieldExpression(
        '{ id: recipeVersionId, dropOff }',
        'dropOff',
      ),
    ).toBe('dropOff');
    expect(
      readObjectLiteralFieldExpression(
        '{ id: recipeVersionId, dropOff }',
        'id',
      ),
    ).toBe('recipeVersionId');
  });

  it('10. RecipeVersion.setPackaging Capsule shape yields all four fields', () => {
    const content = `
      await recipeVersionSetPackaging({
          id: recipeVersionId,
          dropOff,
          bringHot,
          cookOnSite,
        });
    `;
    const invs = extractGeneratedClientCalls(
      content,
      new Set(['RecipeVersion.setPackaging']),
    );
    expect(invs).toHaveLength(1);
    expect(invs[0]!.bodyFields.sort()).toEqual(
      ['bringHot', 'cookOnSite', 'dropOff', 'id'].sort(),
    );
  });
});


describe('extractCommandArgLiteralsInManifestModules', () => {
  it('recovers lifecycle helper command literals (intended position)', () => {
    const content = `
      import { runManifestCommand } from "@/lib/manifest-command";

      async function runLifecycleCommand(
        menuId: string,
        command: "markPublished" | "unpublish",
        body: Record<string, unknown>,
      ) {
        return runManifestCommand({
          entity: "Menu",
          command,
          body: { id: menuId, ...body },
        });
      }

      export async function publish(menuId: string) {
        return runLifecycleCommand(menuId, "markPublished", {});
      }

      export async function unpublish(menuId: string) {
        return runLifecycleCommand(menuId, "unpublish", {});
      }
    `;
    const intents = extractAllManifestInvocations(content).map(i => i.intent);
    expect(intents).toContain('Menu.markPublished');
    expect(intents).toContain('Menu.unpublish');
  });

  it('does not treat FormData field names as commands', () => {
    const content = `
      import { runManifestCommand } from "@/lib/manifest-command";

      const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

      const readEventFields = (formData: FormData) => ({
        title: text(formData, "title"),
        eventType: text(formData, "eventType"),
        budget: text(formData, "budget"),
      });

      export async function createEvent(formData: FormData) {
        const fields = readEventFields(formData);
        return runManifestCommand({
          entity: "Event",
          command: "create",
          body: { title: fields.title, eventType: fields.eventType },
        });
      }
    `;
    const intents = extractAllManifestInvocations(content).map(i => i.intent);
    expect(intents).toContain('Event.create');
    expect(intents).not.toContain('Event.title');
    expect(intents).not.toContain('Event.eventType');
    expect(intents).not.toContain('Event.budget');
  });

  it('does not invent Event.title from Capsule-Pro events/actions.ts', () => {
    const actionsPath = resolve(
      'C:/Projects/capsule-pro/apps/app/app/(authenticated)/(events)/events/actions.ts',
    );
    let content: string;
    try {
      content = readFileSync(actionsPath, 'utf8');
    } catch {
      // Capsule-Pro is not always present in Manifest CI checkouts.
      return;
    }
    const intents = new Set(
      extractAllManifestInvocations(content).map(i => i.intent),
    );
    expect(intents.has('Event.create')).toBe(true);
    expect(intents.has('Event.title')).toBe(false);
    expect(intents.has('Event.eventType')).toBe(false);
    expect(intents.has('Event.budget')).toBe(false);
    expect(intents.has('Event.confirmed')).toBe(false);
  });
});

describe('Capsule-Pro recipe-packaging-editor shorthand payload', () => {
  it('extracts all four fields from the real editor file', () => {
    const editorPath = resolve(
      'C:/Projects/capsule-pro/apps/app/app/(authenticated)/(operations)/kitchen/recipes/[recipeId]/components/recipe-packaging-editor.tsx',
    );
    let content: string;
    try {
      content = readFileSync(editorPath, 'utf8');
    } catch {
      return;
    }
    const invs = extractGeneratedClientCalls(
      content,
      new Set(['RecipeVersion.setPackaging']),
    );
    expect(invs.length).toBeGreaterThanOrEqual(1);
    const fields = new Set(invs.flatMap(i => i.bodyFields));
    expect(fields.has('id')).toBe(true);
    expect(fields.has('dropOff')).toBe(true);
    expect(fields.has('bringHot')).toBe(true);
    expect(fields.has('cookOnSite')).toBe(true);
  });
});
