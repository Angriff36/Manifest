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
  private readonly moduleIntentCache = new Map<
    string,
    Array<ManifestInvocation & { file: string }>
  >();

  constructor(
    private readonly fileContents: Map<string, string>,
    private readonly surface: ProductSurfaceClassifier,
    // Browser-safe: `process` does not exist outside Node (builder runs this in the browser).
    private readonly caseInsensitive = typeof process !== 'undefined' &&
      process.platform === 'win32',
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
      if (list.some((e) => sameEvidence(e, ev))) return;
      list.push(ev);
      proven.set(ev.capabilityId, list);
    };

    const recordInv = (inv: ManifestInvocation, file: string, reachable: boolean) => {
      invocations.push({ ...inv, file, reachable });
    };

    const productFiles = [...this.fileContents.keys()].filter(
      (f) => this.surface.isProductSurface(f) && !this.surface.isGeneratedDefinition(f),
    );
    const uiFiles = productFiles.filter((f) => this.surface.isUiSurface(f));

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
          makeEvidence(
            inv,
            file,
            content,
            'generated_client',
            [
              hop(file, content, inv.index),
              { label: clientFunctionName(inv.entity, inv.command) },
              { label: inv.intent },
            ],
            clientFunctionName(inv.entity, inv.command),
          ),
        );
      }
    }

    // 2) Indirect: UI → used imports / API
    for (const uiFile of uiFiles) {
      this.traceDirectApiFlows(uiFile, capabilityIds, pushProven, staleReferences, recordInv);
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
        recordInv(inv, inv.file, true);
        const ev = makeEvidence(inv, uiFile, content, 'api_route', [
          { label: normalizeRepoPath(uiFile), file: uiFile },
          { label: link.apiPath },
          { label: normalizeRepoPath(inv.file), file: inv.file },
          { label: inv.intent },
        ]);
        if (capabilityIds.has(inv.intent)) pushProven(ev);
        else staleReferences.push(ev);
      }
    }
  }

  private pushUnresolvedImportAmbiguous(
    uiFile: string,
    specifier: string,
    usedSymbols: string[],
    ambiguous: ConsumerEvidence[],
  ): void {
    if (usedSymbols.length === 0) return;
    ambiguous.push({
      capabilityId: `unresolved:${usedSymbols[0]}`,
      entity: '',
      command: '',
      classification: 'imported_helper',
      proofLevel: 'ambiguous',
      source: { file: uiFile },
      consumerSymbol: usedSymbols[0],
      trace: [{ label: normalizeRepoPath(uiFile), file: uiFile }, { label: `import ${specifier}` }],
      confidence: 'low',
    });
  }

  private classifyImportVia(moduleContent: string): ConsumerTraceVia {
    const isServerAction =
      moduleContent.includes('"use server"') || moduleContent.includes("'use server'");
    return isServerAction ? 'server_action' : 'imported_helper';
  }

  private recordImportModuleIntents(
    uiFile: string,
    content: string,
    intentModule: string,
    via: ConsumerTraceVia,
    hopPrefix: TraceHop[],
    consumerSymbol: string | undefined,
    capabilityIds: ReadonlySet<string>,
    pushProven: (ev: ConsumerEvidence) => void,
    staleReferences: ConsumerEvidence[],
    recordInv: (inv: ManifestInvocation, file: string, reachable: boolean) => void,
  ): void {
    for (const inv of this.manifestIntentsForModule(intentModule)) {
      recordInv(inv, inv.file, true);
      const hops: TraceHop[] = [
        { label: normalizeRepoPath(uiFile), file: uiFile },
        ...hopPrefix,
        { label: normalizeRepoPath(inv.file), file: inv.file },
        { label: inv.intent },
      ];
      const ev = makeEvidence(inv, uiFile, content, via, hops, consumerSymbol);
      if (capabilityIds.has(inv.intent)) pushProven(ev);
      else staleReferences.push(ev);
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
      const usedSymbols = imp.symbols.filter((sym) => uiReferencesSymbol(content, sym));
      if (!resolved) {
        this.pushUnresolvedImportAmbiguous(uiFile, imp.specifier, usedSymbols, ambiguous);
        continue;
      }
      if (this.surface.isGeneratedDefinition(resolved)) continue;
      if (usedSymbols.length === 0) continue; // import-only — not a consumer

      const moduleContent = this.fileContents.get(resolved) ?? '';
      const via = this.classifyImportVia(moduleContent);
      const symbolHop: TraceHop = { label: usedSymbols[0]!, file: resolved };
      this.recordImportModuleIntents(
        uiFile,
        content,
        resolved,
        via,
        [symbolHop],
        usedSymbols[0],
        capabilityIds,
        pushProven,
        staleReferences,
        recordInv,
      );

      for (const link of this.parser.resolveHandlersFromUi(moduleContent, this.routeHelpers)) {
        this.recordImportModuleIntents(
          uiFile,
          content,
          link.handlerPath,
          via,
          [symbolHop, { label: link.apiPath }],
          usedSymbols[0],
          capabilityIds,
          pushProven,
          staleReferences,
          recordInv,
        );
      }
    }
  }

  private manifestIntentsForModule(
    entryFile: string,
  ): Array<ManifestInvocation & { file: string }> {
    const cacheKey = this.caseInsensitive
      ? normalizeRepoPath(entryFile).toLowerCase()
      : normalizeRepoPath(entryFile);
    const cached = this.moduleIntentCache.get(cacheKey);
    if (cached) return cached;

    const files = resolveLocalImportClosure(entryFile, this.fileContents, this.caseInsensitive);
    // Keep every invocation with its real defining file. Collapsing to one
    // intent→inv and stamping the barrel import path loses payload locations
    // (e.g. Dish.create .join lives in importer.ts, not actions.ts).
    const result: Array<ManifestInvocation & { file: string }> = [];
    const seen = new Set<string>();
    for (const file of files) {
      if (this.surface.isGeneratedDefinition(file)) continue;
      const content = this.fileContents.get(file);
      if (!content) continue;
      for (const inv of extractAllManifestInvocations(content)) {
        const key = `${file}|${inv.intent}|${inv.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ ...inv, file });
      }
    }
    this.moduleIntentCache.set(cacheKey, result);
    return result;
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
  const reAction = new RegExp(`(?:action|formAction)\\s*=\\s*\\{${escapeRegExp(symbol)}\\}`);
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
export function extractUnknownClientStyleCalls(
  _content: string,
  _capabilityIds: ReadonlySet<string>,
): ManifestInvocation[] {
  return [];
}
