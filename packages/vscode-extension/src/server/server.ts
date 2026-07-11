import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { analyze, getCached, clearCache } from './analyzer';
import { toDiagnostics } from './diagnostics';
import { getDocumentSymbols } from './symbols';
import { getHover } from './hover';
import { getCompletions } from './completion';
import { getDefinition } from './definition';
import { getSemanticDiagnostics, SemanticDiagnosticSettings } from './semantic-diagnostics';
import { getCodeActions } from './code-actions';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let semanticSettings: SemanticDiagnosticSettings = {
  enabled: true,
  projectionHints: true,
};

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['.', ':'] },
      codeActionProvider: true,
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
    },
  };
});

// --- Diagnostics (debounced) ---
const pendingValidation = new Map<string, ReturnType<typeof setTimeout>>();

function validateDocument(doc: TextDocument): void {
  const uri = doc.uri;

  // Debounce: clear any pending validation for this URI
  const existing = pendingValidation.get(uri);
  if (existing) clearTimeout(existing);

  pendingValidation.set(
    uri,
    setTimeout(() => {
      pendingValidation.delete(uri);
      const result = analyze(uri, doc.getText());
      const compilerDiagnostics = toDiagnostics(result.errors);
      const semanticDiagnostics = getSemanticDiagnostics(
        result.program,
        doc.getText(),
        semanticSettings,
      );
      connection.sendDiagnostics({
        uri,
        diagnostics: [...compilerDiagnostics, ...semanticDiagnostics],
      });
    }, 200),
  );
}

connection.onDidChangeConfiguration((change) => {
  const manifest = change.settings?.manifest as
    { semanticDiagnostics?: Partial<SemanticDiagnosticSettings> } | undefined;
  semanticSettings = {
    enabled: manifest?.semanticDiagnostics?.enabled ?? true,
    projectionHints: manifest?.semanticDiagnostics?.projectionHints ?? true,
  };
  for (const doc of documents.all()) validateDocument(doc);
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  clearCache(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// --- Document Symbols ---
connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const cached = getCached(params.textDocument.uri);
  const result = cached ?? analyze(params.textDocument.uri, doc.getText());
  return getDocumentSymbols(result.program);
});

// --- Hover ---
connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const cached = getCached(params.textDocument.uri);
  const result = cached ?? analyze(params.textDocument.uri, doc.getText());
  return getHover(result.program, doc.getText(), params.position);
});

// --- Completion ---
connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const cached = getCached(params.textDocument.uri);
  const result = cached ?? analyze(params.textDocument.uri, doc.getText());
  return getCompletions(result.program);
});

// --- Go-to-Definition ---
connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const cached = getCached(params.textDocument.uri);
  const result = cached ?? analyze(params.textDocument.uri, doc.getText());
  return getDefinition(result.program, doc.getText(), params.textDocument.uri, params.position);
});

connection.onCodeAction((params) => {
  const diagnostics = params.context.diagnostics.filter(
    (diagnostic): diagnostic is Diagnostic => diagnostic.source === 'manifest',
  );
  return getCodeActions(params.textDocument.uri, diagnostics);
});

documents.listen(connection);
connection.listen();
