/**
 * Traces reachable application consumers of Manifest capabilities.
 *
 * Adapted from codebase-explorer IndirectUiConsumerTracer + UiCapabilityConsumption.
 * Import-only and dead actions are NOT consumers.
 * Generated definitions are NOT consumers.
 */

import {
  parseImportSpecifiers,
  resolveImportPath,
  resolveLocalImportClosure,
  normalizeRepoPath,
} from './import-path-resolver.js';
import {
  clientFunctionName,
  extractAllManifestInvocations,
  extractGeneratedClientCalls,
  buildClientFunctionIndex,
  lineAtIndex,
  escapeRegExp,
  type ManifestInvocation,
} from './invocation-extractor.js';
import { ProductionFlowParser } from './production-flow-parser.js';
import { RouteHelperIndex } from './route-helper-index.js';
import { ProductSurfaceClassifier } from './surface-classifier.js';
import type { ConsumerEvidence, ConsumerTraceVia, TraceHop } from './types.js';

export interface TraceResult {
  proven: Map<string, ConsumerEvidence[]>;
  ambiguous: ConsumerEvidence[];
  /** All reachable invocations with payload (for mismatch analysis). */
  invocations: Array<ManifestInvocation & { file: string; reachable: boolean }>;
  /** Stale capability references proven from reachable product code. */
  staleReferences: ConsumerEvidence[];
}

export class ConsumerTracer {
  private readonly parser: ProductionFlowParser;
  private readonly routeHelpers: RouteHelperIndex;

  constructor(
    private readonly fileContents: Map<string, string>,
    private readonly surface: ProductSurfaceClassifier,
    private readonly caseInsensitive = process.platform === 'win32',
  ) {
    this.parser = new ProductionFlowParser(fileContents);
    this.routeHelpers = RouteHelperIndex.build(fileContents);
  }

  trace(capabilityIds: ReadonlySet<string>): TraceResult {
    const proven = new Map<string, ConsumerEvidence[]>();
    const ambiguous: ConsumerEvidence[] = [];
    const invocations: Array<ManifestInvocation & { file: string; reachable: boolean }> = [];
    const staleReferences: ConsumerEvidence[] = [];
    const clientFnIndex = buildClientFunctionIndex(capabilityIds);

    const pushProven = (ev: ConsumerEvidence) => {
      const list = proven.get(ev.capabilityId) ?? [];
      if (list.some(e => sameEvidence(e, ev))) return;
      list.push(ev);
      proven.set(ev.capabilityId, list);
    };

    const recordInv = (
      inv: ManifestInvocation,
      file: string,
      reachable: boolean,
    ) => {
      invocations.push({ ...inv, file, reachable });
    };

    const productFiles = [...this.fileContents.keys()].filter(
      f => this.surface.isProductSurface(f) && !this.surface.isGeneratedDefinition(f),
    );
    const uiFiles = productFiles.filter(f => this.surface.isUiSurface(f));

    // 1) Direct calls only on UI surfaces.
    // Server actions / helpers are NOT consumers unless a UI file reaches them
    // via a used import (section 2). Definitions alone never count.
    for (const file of uiFiles) {
      const content = this.fileContents.get(file);
      if (!content) continue;

      for (const inv of extractAllManifestInvocations(content)) {
        recordInv(inv, file, true);
        this.attribute(inv, file, content, capabilityIds, pushProven, staleReferences);
      }

      for (const inv of extractGeneratedClientCalls(content, capabilityIds, clientFnIndex)) {
        recordInv(inv, file, true);
        pushProven(
          makeEvidence(inv, file, content, 'generated_client', [
            hop(file, content, inv.index),
            { label: clientFunctionName(inv.entity, inv.command) },
            { label: inv.intent },
          ], clientFunctionName(inv.entity, inv.command)),
        );
      }
    }

    // 2) Indirect: UI → used imports / API
    for (const uiFile of uiFiles) {
      this.traceDirectApiFlows(
        uiFile,
        capabilityIds,
        pushProven,
        staleReferences,
        recordInv,
      );
      this.traceUsedImportLinks(
        uiFile,
        capabilityIds,
        pushProven,
        staleReferences,
        recordInv,
        ambiguous,
      );
    }

    return { proven, ambiguous, invocations, staleReferences };
  }

  private attribute(
    inv: ManifestInvocation,
    file: string,
    content: string,
    capabilityIds: ReadonlySet<string>,
    pushProven: (ev: ConsumerEvidence) => void,
    staleReferences: ConsumerEvidence[],
  ): void {
    const classification = classifyInvocation(content, inv.index);
    const ev = makeEvidence(inv, file, content, classification, [
      hop(file, content, inv.index),
      { label: inv.intent },
    ]);
    if (capabilityIds.has(inv.intent)) {
      pushProven(ev);
    } else {
      staleReferences.push(ev);
    }
  }

  private traceDirectApiFlows(
    uiFile: string,
    capabilityIds: ReadonlySet<string>,
    pushProven: (ev: ConsumerEvidence) => void,
    staleReferences: ConsumerEvidence[],
    recordInv: (inv: ManifestInvocation, file: string, reachable: boolean) => void,
  ): void {
    const content = this.fileContents.get(uiFile);
    if (!content) return;
    for (const link of this.parser.resolveHandlersFromUi(content, this.routeHelpers)) {
      for (const inv of this.manifestIntentsForModule(link.handlerPath)) {
        recordInv(inv, link.handlerPath, true);
        const ev = makeEvidence(inv, uiFile, content, 'api_route', [
          { label: normalizeRepoPath(uiFile), file: uiFile },
          { label: link.apiPath },
          { label: normalizeRepoPath(link.handlerPath), file: link.handlerPath },
          { label: inv.intent },
        ]);
        if (capabilityIds.has(inv.intent)) pushProven(ev);
        else staleReferences.push(ev);
      }
    }
  }

  private traceUsedImportLinks(
    uiFile: string,
    capabilityIds: ReadonlySet<string>,
    pushProven: (ev: ConsumerEvidence) => void,
    staleReferences: ConsumerEvidence[],
    recordInv: (inv: ManifestInvocation, file: string, reachable: boolean) => void,
    ambiguous: ConsumerEvidence[],
  ): void {
    const content = this.fileContents.get(uiFile);
    if (!content) return;

    for (const imp of parseImportSpecifiers(content)) {
      if (!(imp.specifier.startsWith('.') || imp.specifier.startsWith('@/'))) continue;
      const resolved = resolveImportPath(
        uiFile,
        imp.specifier,
        this.fileContents,
        this.caseInsensitive,
      );
      if (!resolved) {
        // Unresolved import of a used symbol → ambiguous, not proven defect
        const used = imp.symbols.filter(sym => uiReferencesSymbol(content, sym));
        if (used.length > 0) {
          ambiguous.push({
            capabilityId: `unresolved:${used[0]}`,
            entity: '',
            command: '',
            classification: 'imported_helper',
            proofLevel: 'ambiguous',
            source: { file: uiFile },
            consumerSymbol: used[0],
            trace: [
              { label: normalizeRepoPath(uiFile), file: uiFile },
              { label: `import ${imp.specifier}` },
            ],
            confidence: 'low',
          });
        }
        continue;
      }
      if (this.surface.isGeneratedDefinition(resolved)) continue;

      const usedSymbols = imp.symbols.filter(sym => uiReferencesSymbol(content, sym));
      if (usedSymbols.length === 0) continue; // import-only — not a consumer

      const moduleContent = this.fileContents.get(resolved) ?? '';
      const isServerAction =
        moduleContent.includes('"use server"') || moduleContent.includes("'use server'");
      const via: ConsumerTraceVia = isServerAction ? 'server_action' : 'imported_helper';

      for (const inv of this.manifestIntentsForModule(resolved)) {
        recordInv(inv, resolved, true);
        const ev = makeEvidence(inv, uiFile, content, via, [
          { label: normalizeRepoPath(uiFile), file: uiFile },
          { label: usedSymbols[0]!, file: resolved },
          { label: inv.intent },
        ], usedSymbols[0]);
        if (capabilityIds.has(inv.intent)) pushProven(ev);
        else staleReferences.push(ev);
      }

      for (const link of this.parser.resolveHandlersFromUi(moduleContent, this.routeHelpers)) {
        for (const inv of this.manifestIntentsForModule(link.handlerPath)) {
          recordInv(inv, link.handlerPath, true);
          const ev = makeEvidence(inv, uiFile, content, via, [
            { label: normalizeRepoPath(uiFile), file: uiFile },
            { label: usedSymbols[0]!, file: resolved },
            { label: link.apiPath },
            { label: normalizeRepoPath(link.handlerPath), file: link.handlerPath },
            { label: inv.intent },
          ], usedSymbols[0]);
          if (capabilityIds.has(inv.intent)) pushProven(ev);
          else staleReferences.push(ev);
        }
      }
    }
  }

  private manifestIntentsForModule(entryFile: string): ManifestInvocation[] {
    const files = resolveLocalImportClosure(
      entryFile,
      this.fileContents,
      this.caseInsensitive,
    );
    const intents = new Map<string, ManifestInvocation>();
    for (const file of files) {
      if (this.surface.isGeneratedDefinition(file)) continue;
      const content = this.fileContents.get(file);
      if (!content) continue;
      for (const inv of extractAllManifestInvocations(content)) {
        intents.set(inv.intent, inv);
      }
    }
    return [...intents.values()];
  }
}

function makeEvidence(
  inv: ManifestInvocation,
  sourceFile: string,
  content: string,
  classification: ConsumerTraceVia,
  trace: TraceHop[],
  consumerSymbol?: string,
): ConsumerEvidence {
  return {
    capabilityId: inv.intent,
    entity: inv.entity,
    command: inv.command,
    classification,
    proofLevel: 'proven',
    source: {
      file: sourceFile,
      line: lineAtIndex(content, inv.index),
    },
    consumerSymbol,
    trace,
    confidence: 'high',
  };
}

function hop(file: string, content: string, index: number): TraceHop {
  return {
    label: normalizeRepoPath(file),
    file,
    line: lineAtIndex(content, index),
  };
}

function classifyInvocation(content: string, index: number): ConsumerTraceVia {
  const slice = content.slice(Math.max(0, index - 48), index + 48);
  if (/executeCommand/.test(slice)) return 'execute_command';
  if (/runManifestCommand/.test(slice)) return 'server_action';
  if (/\.runCommand/.test(slice)) return 'runtime_run_command';
  return 'imported_helper';
}

function uiReferencesSymbol(content: string, symbol: string): boolean {
  const body = content.replace(/^\s*import[\s\S]*?;$/gm, '');
  const reCall = new RegExp(`\\b${escapeRegExp(symbol)}\\s*\\(`);
  const reAction = new RegExp(
    `(?:action|formAction)\\s*=\\s*\\{${escapeRegExp(symbol)}\\}`,
  );
  return reCall.test(body) || reAction.test(body);
}

function sameEvidence(a: ConsumerEvidence, b: ConsumerEvidence): boolean {
  return (
    a.capabilityId === b.capabilityId &&
    a.source.file === b.source.file &&
    a.classification === b.classification &&
    a.consumerSymbol === b.consumerSymbol
  );
}

/**
 * Detect camelCase client calls that look like Entity+Command but are not in the contract.
 * Reserved for future stale-client heuristics; executeCommand/runManifest cover stale today.
 */
function extractUnknownClientStyleCalls(
  _content: string,
  _capabilityIds: ReadonlySet<string>,
): ManifestInvocation[] {
  return [];
}

// Keep referenced for future extension without unused-export noise in tests.
void extractUnknownClientStyleCalls;
