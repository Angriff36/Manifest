/**
 * Resource: manifest://semantics
 *
 * Returns the Manifest language semantics reference from docs/spec/semantics.md.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function registerSemanticsResource(server: McpServer): void {
  server.resource('semantics', 'manifest://semantics', async (uri) => {
    const here = dirname(fileURLToPath(import.meta.url));
    const semPath = resolve(here, '../../../../docs/spec/semantics.md');
    try {
      const content = await readFile(semPath, 'utf-8');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: content,
          },
        ],
      };
    } catch {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: 'Semantics reference not found.',
          },
        ],
      };
    }
  });
}
