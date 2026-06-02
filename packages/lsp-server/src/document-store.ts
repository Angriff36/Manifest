import type { CompiledDocument } from './compiler-bridge.js';
import { compileDocument } from './compiler-bridge.js';

/**
 * Stores compiled documents keyed by URI.
 * Recompiles on content change and caches the result.
 */
export class DocumentStore {
  private docs = new Map<string, CompiledDocument>();
  private versions = new Map<string, number>();

  /**
   * Update the document content and recompile.
   * Returns the compiled document.
   */
  async update(uri: string, content: string, version: number): Promise<CompiledDocument> {
    const currentVersion = this.versions.get(uri);
    if (currentVersion !== undefined && currentVersion >= version) {
      // Already up to date
      const existing = this.docs.get(uri);
      if (existing) return existing;
    }

    const doc = await compileDocument(content);
    this.docs.set(uri, doc);
    this.versions.set(uri, version);
    return doc;
  }

  /**
   * Get a previously compiled document.
   */
  get(uri: string): CompiledDocument | undefined {
    return this.docs.get(uri);
  }

  /**
   * Remove a document from the store.
   */
  delete(uri: string): void {
    this.docs.delete(uri);
    this.versions.delete(uri);
  }
}
