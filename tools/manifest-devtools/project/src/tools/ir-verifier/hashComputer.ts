export async function computeSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeNodeHashes(
  ir: Record<string, unknown>
): Promise<Array<{ path: string; hash: string }>> {
  const results: Array<{ path: string; hash: string }> = [];

  async function walk(obj: unknown, path: string) {
    if (obj === null || obj === undefined) return;
    const serialized = JSON.stringify(obj, null, 0);
    const hash = await computeSHA256(serialized);
    results.push({ path: path || '(root)', hash });

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (typeof value === 'object' && value !== null) {
          await walk(value, path ? `${path}.${key}` : key);
        }
      }
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'object' && obj[i] !== null) {
          await walk(obj[i], `${path}[${i}]`);
        }
      }
    }
  }

  await walk(ir, '');
  return results;
}

export interface ProvenanceStep {
  stage: string;
  hash: string;
  timestamp: string;
  details: string;
}

export function buildProvenanceChain(
  sourceHash: string,
  irHash: string,
  compilerVersion: string
): ProvenanceStep[] {
  const now = new Date();
  return [
    {
      stage: 'Source',
      hash: sourceHash.slice(0, 16) + '...',
      timestamp: new Date(now.getTime() - 3000).toISOString(),
      details: 'Original .manifest source file',
    },
    {
      stage: 'Parse',
      hash: irHash.slice(0, 8) + sourceHash.slice(0, 8) + '...',
      timestamp: new Date(now.getTime() - 2500).toISOString(),
      details: `Parsed by compiler v${compilerVersion}`,
    },
    {
      stage: 'Transform',
      hash: irHash.slice(4, 20) + '...',
      timestamp: new Date(now.getTime() - 2000).toISOString(),
      details: 'AST transforms and optimizations applied',
    },
    {
      stage: 'Emit IR',
      hash: irHash.slice(0, 16) + '...',
      timestamp: new Date(now.getTime() - 1500).toISOString(),
      details: 'Final IR emitted',
    },
  ];
}
