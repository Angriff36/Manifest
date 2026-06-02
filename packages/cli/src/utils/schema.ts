/**
 * Schema utility functions for the CLI
 */

import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

/**
 * Returns the path to the bundled IR schema.
 */
export function bundledSchemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..', 'docs', 'spec', 'ir', 'ir-v1.schema.json');
}
