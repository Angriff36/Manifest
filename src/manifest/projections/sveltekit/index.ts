/**
 * Public surface of the SvelteKit projection module.
 *
 * Consumers:
 *   import { SvelteKitProjection } from '@angriff36/manifest/projections/sveltekit';
 *   const projection = new SvelteKitProjection();
 *   const result = projection.generate(ir, { surface: 'sveltekit.server', entity: 'Recipe' });
 */

export { SvelteKitProjection, SVELTEKIT_DEFAULTS } from './generator.js';
export type { SvelteKitProjectionOptions } from './types.js';
