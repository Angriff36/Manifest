/**
 * Action-intent proof for wire-existing-control — reject false matches.
 *
 * Live failure: CollectionCase.escalateToLegal was wired onto a "New case"
 * create-dialog button. Same entity / page / nearby words are not enough.
 */

import { describe, it, expect } from 'vitest';
import {
  contractFrom,
  fileMapFromRecord,
  inspectWiringConsumersSync,
  remediateWiringSync,
  planWiringRepairs,
  applyRepairPlan,
} from './remediate-test-fixtures.js';
import { verifyRepair } from './verifier.js';
import {
  COLLECTION_DOMAIN,
  NEW_CASE_BUTTON_PAGE,
} from './wire-existing-control-action.fixtures.js';

describe('wire-existing-control action-intent (reject)', () => {
  it('1. New case create-dialog button is never used for escalateToLegal', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': NEW_CASE_BUTTON_PAGE,
    });
    const report = inspectWiringConsumersSync({
      contract,
      fileContents: files,
      config: { roots: ['.'], strictCoverage: true },
    });
    const bundle = planWiringRepairs({
      contract,
      report,
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    const plan = bundle.plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
    expect(plan?.edits ?? []).toHaveLength(0);

    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'one-defect',
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    const src = files.get('apps/app/app/collection-cases/page.tsx')!;
    expect(src).toContain('setCreateDialogOpen(true)');
    expect(src).not.toMatch(/collectionCaseEscalateToLegal/);
  });

  it('2. same entity page is insufficient', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': `
        export function CollectionCasesPage() {
          return <div><h1>CollectionCase</h1><button onClick={() => refresh()}>Refresh</button></div>;
        }
      `,
    });
    const bundle = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    expect(bundle.plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal')?.decision).toBe(
      'ambiguous-product-decision',
    );
  });

  it('3. same entity file is insufficient', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/list.tsx': `
        export function CollectionCaseList({ cases }: { cases: { id: string }[] }) {
          return <button onClick={() => setFilter("open")}>Filter</button>;
        }
      `,
    });
    const bundle = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    expect(
      bundle.plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal')
        ?.automaticApplicationAllowed,
    ).toBe(false);
  });

  it('4. command words elsewhere in file are insufficient', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': `
        export function Page() {
          return (
            <div>
              <p>Staff may escalate to legal from the case detail menu.</p>
              <Button onClick={() => setCreateDialogOpen(true)}>New case</Button>
            </div>
          );
        }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.edits ?? []).toHaveLength(0);
  });

  it('5. "New case" cannot match escalateToLegal', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/[id]/page.tsx': `
        export function Detail({ caseId }: { caseId: string }) {
          // local-only
          return <Button onClick={() => setCreateDialogOpen(true)}>New case</Button>;
        }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal');
    expect(plan?.decision).toBe('ambiguous-product-decision');
  });

  it('6. existing create-dialog behavior cannot be replaced', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': NEW_CASE_BUTTON_PAGE,
    });
    const result = remediateWiringSync({
      contract,
      fileContents: files,
      mode: 'apply',
      capabilityId: 'CollectionCase.escalateToLegal',
    });
    expect(result.applied.filter(a => a.applied)).toHaveLength(0);
    expect(files.get('apps/app/app/collection-cases/page.tsx')).toContain(
      'setCreateDialogOpen(true)',
    );
  });

  it('7. instance command without instance identity cannot auto-apply', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/board.tsx': `
        export function Board() {
          return (
            <button
              data-manifest-capability="CollectionCase.escalateToLegal"
              onClick={noop}
            >
              Escalate to legal
            </button>
          );
        }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.automaticApplicationAllowed).toBe(false);
  });

  it('8. empty {} call for an instance command is rejected by verification', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/[id]/page.tsx': `
        export function Detail({ caseId }: { caseId: string }) {
          return (
            <button data-manifest-capability="CollectionCase.escalateToLegal" onClick={noop}>
              Escalate to legal
            </button>
          );
        }
      `,
    });
    const forged = {
      findingId: 'unwired:CollectionCase.escalateToLegal:forged-empty',
      entity: 'CollectionCase',
      command: 'escalateToLegal',
      capabilityId: 'CollectionCase.escalateToLegal',
      repairKind: 'wire-existing-control' as const,
      decision: 'repairable-with-existing-pattern' as const,
      confidence: 'high' as const,
      automaticApplicationAllowed: true,
      rationale: 'forged empty instance call',
      evidence: [],
      sourceFiles: ['apps/app/app/collection-cases/[id]/page.tsx'],
      consumerTrace: [{ file: 'apps/app/app/collection-cases/[id]/page.tsx' }],
      preconditions: [],
      postconditions: [
        {
          id: 'consumed',
          description: 'consumed',
          resolvedMismatchKinds: [] as [],
          requireConsumed: true,
        },
      ],
      edits: [
        {
          file: 'apps/app/app/collection-cases/[id]/page.tsx',
          description: 'wire empty',
          operation: {
            type: 'wire-control-to-binding' as const,
            controlSymbol: 'escalateToLegal',
            bindingCallee: 'collectionCaseEscalateToLegal',
            handlerSnippet: 'noop',
            // Deliberately omit identityExpression to force empty {}
            ensureImport: {
              module: '@/app/lib/manifest-client.generated',
              names: ['collectionCaseEscalateToLegal'],
            },
          },
        },
      ],
      verificationMethod: 'reinspect' as const,
      priority: 50,
    };
    const patch = applyRepairPlan(forged, files);
    expect(patch.ok).toBe(true);
    const content = [...patch.nextContents.values()][0]!;
    expect(content).toMatch(/collectionCaseEscalateToLegal\(\s*\{\s*\}\s*\)/);
    const verification = verifyRepair(forged, contract, patch.nextContents, {
      roots: ['.'],
      strictCoverage: true,
    });
    expect(verification.ok).toBe(false);
    expect(verification.message).toMatch(/identity|instance|empty|semantic/i);
  });

  it('9. file-wide keyword matching cannot qualify a specific control', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': `
        export function Page({ caseId }: { caseId: string }) {
          // local-only
          // TODO wire CollectionCase.escalateToLegal
          return (
            <div>
              <h1>Escalate to legal workflow</h1>
              <Button onClick={() => setCreateDialogOpen(true)}>New case</Button>
            </div>
          );
        }
      `,
    });
    const plan = planWiringRepairs({
      contract,
      report: inspectWiringConsumersSync({
        contract,
        fileContents: files,
        config: { roots: ['.'], strictCoverage: true },
      }),
      fileContents: files,
      capabilityId: 'CollectionCase.escalateToLegal',
    }).plans.find(p => p.capabilityId === 'CollectionCase.escalateToLegal');
    expect(plan?.decision).toBe('ambiguous-product-decision');
    expect(plan?.edits ?? []).toHaveLength(0);
  });

  it('10. verification rejects deletion of unrelated prior behavior', async () => {
    const contract = await contractFrom(COLLECTION_DOMAIN);
    // Simulate the unsafe post-repair state that was proven in Capsule-Pro.
    const unsafePatched = NEW_CASE_BUTTON_PAGE.replace(
      'onClick={() => setCreateDialogOpen(true)}',
      'onClick={() => { void collectionCaseEscalateToLegal({}); }}',
    );
    const files = fileMapFromRecord({
      'apps/app/app/collection-cases/page.tsx': unsafePatched,
    });
    const forged = {
      findingId: 'unwired:CollectionCase.escalateToLegal:forged-new-case',
      entity: 'CollectionCase',
      command: 'escalateToLegal',
      capabilityId: 'CollectionCase.escalateToLegal',
      repairKind: 'wire-existing-control' as const,
      decision: 'repairable-with-existing-pattern' as const,
      confidence: 'high' as const,
      automaticApplicationAllowed: true,
      rationale: 'forged new-case wire',
      evidence: [],
      sourceFiles: ['apps/app/app/collection-cases/page.tsx'],
      consumerTrace: [{ file: 'apps/app/app/collection-cases/page.tsx' }],
      preconditions: [],
      postconditions: [
        {
          id: 'consumed',
          description: 'consumed',
          resolvedMismatchKinds: [] as [],
          requireConsumed: true,
        },
      ],
      edits: [
        {
          file: 'apps/app/app/collection-cases/page.tsx',
          description: 'wire new case',
          operation: {
            type: 'wire-control-to-binding' as const,
            controlSymbol: 'escalateToLegal',
            bindingCallee: 'collectionCaseEscalateToLegal',
            ensureImport: {
              module: '@/app/lib/manifest-client.generated',
              names: ['collectionCaseEscalateToLegal'],
            },
          },
        },
      ],
      verificationMethod: 'reinspect' as const,
      priority: 50,
    };
    const verification = verifyRepair(forged, contract, files, {
      roots: ['.'],
      strictCoverage: true,
    });
    expect(verification.ok).toBe(false);
    expect(verification.message).toMatch(/semantic|unrelated|behavior|identity|new case|intent|label/i);
  });
});
