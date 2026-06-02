import {
  Connection,
  TextDocuments,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  CompletionItem,
  Hover,
  Location,
  DocumentSymbol,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentStore } from './document-store.js';
import { buildSymbolIndex, type SymbolEntry } from './symbols/symbol-index.js';
import { toDiagnostics } from './features/diagnostics.js';
import { getDocumentSymbols } from './features/document-symbols.js';
import { getCompletions } from './features/completion.js';
import { getHover } from './features/hover.js';
import { getDefinition } from './features/definition.js';

/**
 * ManifestLspServer wires LSP protocol handlers to the Manifest compiler pipeline.
 */
export class ManifestLspServer {
  private documents: TextDocuments<TextDocument>;
  private store: DocumentStore;
  private symbolCache = new Map<string, SymbolEntry[]>();

  constructor(private connection: Connection) {
    this.documents = new TextDocuments(TextDocument);
    this.store = new DocumentStore();

    this.setupHandlers();
    this.documents.listen(this.connection);
    this.connection.listen();
  }

  private setupHandlers() {
    this.connection.onInitialize((_params: InitializeParams): InitializeResult => {
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Full,
          completionProvider: {
            triggerCharacters: ['.', ' ', ':'],
            resolveProvider: false,
          },
          hoverProvider: true,
          definitionProvider: true,
          documentSymbolProvider: true,
        },
      };
    });

    this.connection.onInitialized(() => {
      this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
    });

    // Recompile on document change
    this.documents.onDidChangeContent(async (change) => {
      await this.validateDocument(change.document);
    });

    // Clean up on close
    this.documents.onDidClose((event) => {
      this.store.delete(event.document.uri);
      this.symbolCache.delete(event.document.uri);
      this.connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    });

    // Completion
    this.connection.onCompletion((params): CompletionItem[] => {
      const doc = this.store.get(params.textDocument.uri);
      if (!doc) return [];
      return getCompletions(doc.tokens, doc.program, doc.ir, params.position);
    });

    // Hover
    this.connection.onHover((params): Hover | null => {
      const doc = this.store.get(params.textDocument.uri);
      if (!doc) return null;
      return getHover(doc.tokens, doc.ir, params.position);
    });

    // Go-to-definition
    this.connection.onDefinition((params): Location | null => {
      const doc = this.store.get(params.textDocument.uri);
      if (!doc) return null;
      const symbols = this.symbolCache.get(params.textDocument.uri) ?? [];
      return getDefinition(doc.tokens, symbols, params.textDocument.uri, params.position);
    });

    // Document symbols (outline)
    this.connection.onDocumentSymbol((params): DocumentSymbol[] => {
      const doc = this.store.get(params.textDocument.uri);
      if (!doc) return [];
      return getDocumentSymbols(doc.program);
    });
  }

  private async validateDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const uri = textDocument.uri;
    const version = textDocument.version;

    const doc = await this.store.update(uri, text, version);

    // Update symbol cache
    this.symbolCache.set(uri, buildSymbolIndex(doc.program));

    // Publish diagnostics
    const diagnostics = toDiagnostics(doc.parseErrors, doc.irDiagnostics);
    this.connection.sendDiagnostics({ uri, diagnostics });
  }
}
