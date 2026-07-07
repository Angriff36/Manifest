import { describe, it, expect } from 'vitest';
import {
  GenerationManifestRecorder,
  GenerationArtifactRecord,
} from './generation-manifest';

const artifact = (over: Partial<GenerationArtifactRecord> = {}): GenerationArtifactRecord => ({
  artifactId: 'nextjs.route',
  surface: 'nextjs.route',
  entity: 'Recipe',
  command: null,
  pathHint: 'app/api/recipes/list/route.ts',
  outputFile: 'apps/api/app/api/recipes/list/route.ts',
  ...over,
});

describe('GenerationManifestRecorder', () => {
  it('emits the stable schema envelope', () => {
    const rec = new GenerationManifestRecorder();
    rec.recordArtifact(artifact());
    const m = rec.build();
    expect(m.schema).toBe('manifest/generation-manifest');
    expect(m.version).toBe(1);
  });

  it('has no timestamp — byte-stable serialization across reruns', () => {
    const build = () => {
      const rec = new GenerationManifestRecorder();
      rec.recordArtifact(artifact());
      rec.recordDispatcher({
        outputFile: 'apps/api/app/api/manifest/[entity]/commands/[command]/route.ts',
        mode: 'interpreter',
        dispatchScope: 'all-ir-commands',
        runtimeEntry: 'executeManifestCommand',
      });
      return rec.serialize();
    };
    expect(build()).toBe(build());
    expect(build()).not.toMatch(/generatedAt|\d{4}-\d{2}-\d{2}T/);
  });

  it('sorts artifacts deterministically regardless of record order', () => {
    const a = artifact({ outputFile: 'a/one.ts', artifactId: 'x' });
    const b = artifact({ outputFile: 'b/two.ts', artifactId: 'y' });
    const rec1 = new GenerationManifestRecorder();
    rec1.recordArtifact(b);
    rec1.recordArtifact(a);
    const rec2 = new GenerationManifestRecorder();
    rec2.recordArtifact(a);
    rec2.recordArtifact(b);
    expect(rec1.serialize()).toBe(rec2.serialize());
    expect(rec1.build().artifacts.map((r) => r.outputFile)).toEqual(['a/one.ts', 'b/two.ts']);
  });

  it('dedupes identical records (rerun over the same IR records once)', () => {
    const rec = new GenerationManifestRecorder();
    rec.recordArtifact(artifact());
    rec.recordArtifact(artifact());
    expect(rec.build().artifacts).toHaveLength(1);
  });

  it('dispatcher records carry explicit scope, never implied by mode', () => {
    const rec = new GenerationManifestRecorder();
    rec.recordDispatcher({
      outputFile: 'apps/api/app/api/manifest/[entity]/commands/[command]/route.ts',
      mode: 'interpreter',
      dispatchScope: 'all-ir-commands',
      runtimeEntry: 'inline',
    });
    const m = rec.build();
    expect(m.dispatchers).toHaveLength(1);
    expect(m.dispatchers[0].dispatchScope).toBe('all-ir-commands');
  });

  it('isEmpty reflects whether anything was recorded', () => {
    const rec = new GenerationManifestRecorder();
    expect(rec.isEmpty).toBe(true);
    rec.recordArtifact(artifact());
    expect(rec.isEmpty).toBe(false);
  });
});
