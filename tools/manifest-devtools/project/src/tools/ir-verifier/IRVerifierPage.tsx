import { useState, useCallback } from 'react';
import {
  Upload,
  ShieldCheck,
  ShieldAlert,
  Hash,
  Link2,
  Copy,
  Check,
  FileJson,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import CodeEditor from '../../components/CodeEditor';
import { computeSHA256, computeNodeHashes, buildProvenanceChain, type ProvenanceStep } from './hashComputer';
import { supabase } from '../../lib/supabase';

const SAMPLE_IR = JSON.stringify(
  {
    version: '0.3.0',
    module: 'validate-order',
    functions: [
      {
        name: 'validate_order',
        params: ['order'],
        guards: [
          { expr: 'order.total > 0', line: 2 },
          { expr: 'order.items.length > 0', line: 3 },
        ],
        body: {
          type: 'block',
          statements: [
            { type: 'binding', name: 'tax', expr: 'calculate_tax(order.total)' },
            { type: 'return', expr: '{ subtotal: order.total, tax: tax }' },
          ],
        },
      },
    ],
    metadata: {
      compiled_at: '2025-01-15T10:30:00Z',
      compiler_version: '0.3.0',
      optimization_level: 2,
      source_hash: 'a1b2c3d4e5f6...',
    },
  },
  null,
  2
);

interface VerificationState {
  documentHash: string;
  nodeHashes: Array<{ path: string; hash: string }>;
  provenanceChain: ProvenanceStep[];
  dbMatch: boolean | null;
  compilerVersion: string;
}

export default function IRVerifierPage() {
  const [irContent, setIrContent] = useState(SAMPLE_IR);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    setVerifying(true);
    setParseError(null);

    try {
      const parsed = JSON.parse(irContent);
      const documentHash = await computeSHA256(irContent);
      const nodeHashes = await computeNodeHashes(parsed);
      const compilerVersion = parsed?.metadata?.compiler_version || 'unknown';
      const sourceHash = parsed?.metadata?.source_hash || '';

      const provenanceChain = buildProvenanceChain(
        sourceHash ? await computeSHA256(sourceHash) : documentHash,
        documentHash,
        compilerVersion
      );

      let dbMatch: boolean | null = null;
      try {
        const { data } = await supabase
          .from('provenance_records')
          .select('id, ir_hash')
          .eq('ir_hash', documentHash)
          .maybeSingle();
        dbMatch = data !== null;
      } catch {
        dbMatch = null;
      }

      setVerification({ documentHash, nodeHashes, provenanceChain, dbMatch, compilerVersion });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON');
    } finally {
      setVerifying(false);
    }
  }, [irContent]);

  const registerProvenance = useCallback(async () => {
    if (!verification) return;
    try {
      await supabase.from('provenance_records').insert({
        ir_hash: verification.documentHash,
        ir_content: JSON.parse(irContent),
        compiler_version: verification.compilerVersion,
        is_public: true,
      });
      setVerification((prev) => (prev ? { ...prev, dbMatch: true } : null));
    } catch {
      // silent
    }
  }, [verification, irContent]);

  const copyHash = async () => {
    if (!verification) return;
    await navigator.clipboard.writeText(verification.documentHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100 mb-1">IR Provenance Verifier</h1>
        <p className="text-sm text-slate-400">
          Verify Intermediate Representation integrity. Compute hashes, check provenance chains, detect tampering.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="tool-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <FileJson size={14} /> IR Content
              </h3>
              {parseError && <span className="badge-error text-[10px]">Invalid JSON</span>}
            </div>
            <CodeEditor value={irContent} onChange={setIrContent} placeholder="Paste IR JSON here..." height="360px" />
            {parseError && <p className="text-xs text-rose-400 mt-2">{parseError}</p>}
          </div>

          <button onClick={verify} disabled={verifying} className="btn-primary w-full justify-center">
            {verifying ? (
              <span className="animate-pulse-subtle">Verifying...</span>
            ) : (
              <>
                <ShieldCheck size={14} /> Verify Integrity
              </>
            )}
          </button>
        </div>

        <div className="space-y-4">
          {!verification && (
            <div className="tool-panel flex flex-col items-center justify-center py-24 text-slate-500">
              <ShieldCheck size={32} className="mb-3 text-slate-600" />
              <p className="text-sm">Click "Verify Integrity" to analyze IR</p>
            </div>
          )}

          {verification && (
            <>
              <div
                className={`tool-panel p-4 border-l-4 animate-slide-in ${
                  verification.dbMatch === true
                    ? 'border-l-emerald-500'
                    : verification.dbMatch === false
                    ? 'border-l-amber-500'
                    : 'border-l-slate-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  {verification.dbMatch === true ? (
                    <ShieldCheck size={24} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert size={24} className="text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {verification.dbMatch === true
                        ? 'Verified - IR matches known provenance record'
                        : verification.dbMatch === false
                        ? 'Unknown - No matching provenance record found'
                        : 'Could not check provenance database'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Compiler: {verification.compilerVersion}
                    </p>
                  </div>
                </div>
              </div>

              <div className="tool-panel p-4 animate-slide-in">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Hash size={14} /> Document Hash
                  </h4>
                  <button onClick={copyHash} className="btn-ghost text-xs">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="code-font text-xs text-accent break-all bg-surface rounded-md p-2 border border-surface-border">
                  sha256:{verification.documentHash}
                </p>
              </div>

              <div className="tool-panel p-4 animate-slide-in">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2 mb-3">
                  <Link2 size={14} /> Provenance Chain
                </h4>
                <div className="space-y-0">
                  {verification.provenanceChain.map((step, i) => (
                    <ProvenanceStepRow key={i} step={step} isLast={i === verification.provenanceChain.length - 1} />
                  ))}
                </div>
              </div>

              <NodeHashList hashes={verification.nodeHashes} />

              {verification.dbMatch === false && (
                <button onClick={registerProvenance} className="btn-secondary w-full justify-center">
                  <Upload size={14} /> Register Provenance Record
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProvenanceStepRow({ step, isLast }: { step: ProvenanceStep; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-accent border-2 border-accent/30 shrink-0 mt-1" />
        {!isLast && <div className="w-px flex-1 bg-surface-border my-1" />}
      </div>
      <div className={`pb-3 ${isLast ? '' : ''}`}>
        <p className="text-xs font-medium text-slate-200">{step.stage}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{step.details}</p>
        <p className="code-font text-[10px] text-slate-600 mt-0.5">{step.hash}</p>
      </div>
    </div>
  );
}

function NodeHashList({ hashes }: { hashes: Array<{ path: string; hash: string }> }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? hashes : hashes.slice(0, 3);

  return (
    <div className="tool-panel p-4 animate-slide-in">
      <h4 className="text-sm font-medium text-slate-300 mb-3">Node Hashes ({hashes.length})</h4>
      <div className="space-y-1">
        {shown.map((h, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="code-font text-slate-400 w-32 truncate" title={h.path}>{h.path}</span>
            <span className="code-font text-slate-600 truncate">{h.hash.slice(0, 24)}...</span>
          </div>
        ))}
      </div>
      {hashes.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="btn-ghost text-xs mt-2">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Show less' : `Show all ${hashes.length}`}
        </button>
      )}
    </div>
  );
}
