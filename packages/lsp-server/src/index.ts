import {
  createConnection,
  ProposedFeatures,
} from 'vscode-languageserver/node.js';
import { ManifestLspServer } from './server.js';

/**
 * Start the Manifest LSP server.
 * Automatically detects transport: --stdio, --node-ipc, or --socket.
 */
export function start() {
  const connection = createConnection(ProposedFeatures.all);
  new ManifestLspServer(connection);
}
