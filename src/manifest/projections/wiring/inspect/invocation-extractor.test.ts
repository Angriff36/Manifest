/**
 * Invocation extractor — command-arg literal recovery must not invent
 * capabilities from FormData field names or object-literal noise.
 */

import { describe, it, expect } from 'vitest';
import { extractAllManifestInvocations } from './invocation-extractor.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
