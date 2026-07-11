/**
 * Resource: manifest://ir/schema
 *
 * Returns the IR JSON Schema from docs/spec/ir/ir-v1.schema.json.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function registerIRSchemaResource(server: McpServer): void {
  server.resource('ir-schema', 'manifest://ir/schema', async (uri) => {
    const here = dirname(fileURLToPath(import.meta.url));
    // From dist/resources/ or src/resources/ → docs/spec/ir/ir-v1.schema.json
    const schemaPath = resolve(here, '../../../../docs/spec/ir/ir-v1.schema.json');
    try {
      const content = await readFile(schemaPath, 'utf-8');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/schema+json',
            text: content,
          },
        ],
      };
    } catch {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'IR schema file not found' }),
          },
        ],
      };
    }
  });
}
