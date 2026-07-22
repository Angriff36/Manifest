/**
 * Next.js artifact path hints — module-aware subscription hooks.
 *
 * Route pathHints nest via {@link resolveEntitySegment} `entityModules`
 * (shared route-contract). Hooks are file-layout-only.
 */

import { moduleDirSegment } from '../shared/module-path.js';

export function nextjsSubscriptionHookPathHint(args: {
  entityName: string;
  hooksDir: string;
  module?: string;
}): string {
  const file = `use${args.entityName}Subscription.ts`;
  const mod = moduleDirSegment(args.module);
  return mod
    ? `${args.hooksDir}/${mod}/${file}`
    : `${args.hooksDir}/${file}`;
}
