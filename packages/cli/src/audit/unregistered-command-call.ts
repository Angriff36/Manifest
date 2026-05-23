/**
 * unregistered-command-call detector.
 *
 * Scans application TS/JS files for `runtime.runCommand("entity.command", …)`
 * invocations and reports findings when the called command is absent from
 * the supplied commands registry, or when the command name is dynamic and
 * cannot be statically resolved against the registry.
 *
 * This detector is one of the building blocks of the `enforce-surface` CLI
 * command, which guards against agents inventing duplicate or bypass write
 * paths when a registered Manifest command already exists.
 */

import fs from 'node:fs/promises';

interface CommandRegistryEntry {
  entity: string;
  command: string;
  commandId?: string;
}

interface CommandRegistry {
  commands: CommandRegistryEntry[];
}

export async function loadCommandSet(registryPath: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await fs.readFile(registryPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Failed to read commands registry at ${registryPath}: ${(err as Error).message}`
    );
  }
  const parsed = JSON.parse(raw) as CommandRegistry;
  const ids = new Set<string>();
  for (const c of parsed.commands ?? []) {
    ids.add(c.commandId ?? `${c.entity}.${c.command}`);
  }
  return ids;
}
