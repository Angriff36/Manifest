/**
 * Generation-manifest recorder — schema `manifest/generation-manifest` v1.
 *
 * Records what the generate command ACTUALLY wrote (the resolved outputFile,
 * not merely the projection's pathHint) plus the dispatcher dispatch surface,
 * so downstream analyzers can prove GENERATES / DISPATCHES_TO relationships
 * from explicit machine-readable evidence instead of inferring them from
 * filenames.
 *
 * Contract:
 *  - `outputFile` is the file actually written (cwd-relative, forward slashes)
 *  - records are deterministically sorted (outputFile, then artifactId) and
 *    deduplicated, so re-running with unchanged inputs is byte-stable
 *  - no timestamps — byte-stability is part of the contract
 *  - entity/command come from the ProjectionRequest, never from filenames
 *  - dispatcher fan-out scope is explicit (`dispatchScope`); consumers must
 *    not infer scope from `mode`
 */

export interface GenerationArtifactRecord {
  /** ProjectionArtifact.id — stable per-artifact identifier. */
  artifactId: string;
  /** ProjectionRequest.surface that produced this artifact. */
  surface: string;
  /** ProjectionRequest.entity, or null for non-entity-scoped surfaces. */
  entity: string | null;
  /** ProjectionRequest.command, or null for non-command-scoped surfaces. */
  command: string | null;
  /** The projection's suggested path (pre-resolution). */
  pathHint: string;
  /** The file actually written, cwd-relative with forward slashes. */
  outputFile: string;
}

export interface GenerationDispatcherRecord {
  /** The dispatcher route file actually written. */
  outputFile: string;
  /** The dispatcher interprets compiled IR at runtime. */
  mode: 'interpreter';
  /**
   * Explicit fan-out scope: this dispatcher resolves EVERY IR command.
   * Declared here so analyzers can justify dispatcher→command edges from the
   * artifact itself rather than from knowledge of what `mode` implies.
   */
  dispatchScope: 'all-ir-commands';
  /**
   * Runtime entry the dispatcher calls: the configured executor import name
   * (externalExecutor mode) or 'inline' when the route builds the engine
   * itself.
   */
  runtimeEntry: string;
}

export interface GenerationManifest {
  schema: 'manifest/generation-manifest';
  version: 1;
  artifacts: GenerationArtifactRecord[];
  dispatchers: GenerationDispatcherRecord[];
}

export class GenerationManifestRecorder {
  private artifacts: GenerationArtifactRecord[] = [];
  private dispatchers: GenerationDispatcherRecord[] = [];

  recordArtifact(record: GenerationArtifactRecord): void {
    this.artifacts.push(record);
  }

  recordDispatcher(record: GenerationDispatcherRecord): void {
    this.dispatchers.push(record);
  }

  get isEmpty(): boolean {
    return this.artifacts.length === 0 && this.dispatchers.length === 0;
  }

  build(): GenerationManifest {
    return {
      schema: 'manifest/generation-manifest',
      version: 1,
      artifacts: dedupe(this.artifacts).sort(
        (a, b) =>
          a.outputFile.localeCompare(b.outputFile) ||
          a.artifactId.localeCompare(b.artifactId)
      ),
      dispatchers: dedupe(this.dispatchers).sort((a, b) =>
        a.outputFile.localeCompare(b.outputFile)
      ),
    };
  }

  /** Byte-stable serialization: no timestamps, sorted + deduped records. */
  serialize(): string {
    return JSON.stringify(this.build(), null, 2) + '\n';
  }
}

function dedupe<T>(records: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const record of records) {
    const key = JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}
