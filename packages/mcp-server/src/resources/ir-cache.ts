/**
 * Resource: manifest://ir/{contentHash}
 *
 * Returns cached compiled IR JSON by content hash.
 * Uses ResourceTemplate for dynamic URI matching.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sessionStore } from '../state/session-store.js';

export function registerIRCacheResource(server: McpServer): void {
  const template = new ResourceTemplate('manifest://ir/{contentHash}', {
    list: async () => {
      const entries = sessionStore.list();
      return {
        resources: entries.map((entry) => ({
          uri: `manifest://ir/${entry.contentHash}`,
          name: `IR ${entry.contentHash.slice(0, 12)}...`,
          mimeType: 'application/json',
        })),
      };
    },
  });

  server.resource('ir-cache', template, async (uri, variables) => {
    const hash = variables.contentHash as string;
    const entry = sessionStore.get(hash);

    if (!entry) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ error: 'Not found', contentHash: hash }),
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(entry.ir, null, 2),
        },
      ],
    };
  });
}
