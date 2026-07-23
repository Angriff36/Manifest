/**
 * Analytics artifact path hints — optional per-module directory nesting.
 *
 * Per-entity handlers with an IR `module` emit under `analytics/handlers/<module>/…`.
 * Module-less names and monolith artifacts keep the historical flat layout.
 */

import { moduleDirSegment } from '../shared/module-path.js';

function entityNameLower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function analyticsEntityHandlerPathHint(entity: { name: string; module?: string }): string {
  const file = `${entityNameLower(entity.name)}.ts`;
  const mod = moduleDirSegment(entity.module);
  return mod ? `analytics/handlers/${mod}/${file}` : `analytics/handlers/${file}`;
}

export function analyticsHandlersMonolithPathHint(): string {
  return 'analytics/handlers.ts';
}

export function analyticsTrackingPlanPathHint(): string {
  return 'analytics/tracking-plan.json';
}

export function analyticsEventsPathHint(): string {
  return 'analytics/analytics.events.ts';
}
