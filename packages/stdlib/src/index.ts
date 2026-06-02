/**
 * @manifest/stdlib
 *
 * Curated standard library of reusable entity archetypes, property types,
 * and constraint definitions for the Manifest DSL.
 *
 * Contents:
 * - value objects: Money, Address, EmailAddress, PhoneNumber, AuditTrail
 * - enums: Status, Priority, AuditAction
 * - archetypes: Timestamped, SoftDeletable, Owned, Auditable, StateMachine
 *
 * Usage in a .manifest file:
 *
 *   use "./node_modules/@manifest/stdlib/manifest/values/money.manifest"
 *   use "./node_modules/@manifest/stdlib/manifest/enums/status.manifest"
 *
 *   entity Product {
 *     property required id: string
 *     property name: string
 *     property price: Money
 *     property status: Status = draft
 *     timestamps
 *     store Product in memory
 *   }
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve the absolute path to the package root (where `manifest/` lives).
 *
 * Works in three layouts:
 * - src/index.ts source build → ../../manifest
 * - dist/index.js published build → ../../manifest (mirror layout)
 * - pnpm hoisted node_modules → ../../manifest
 */
function packageRoot(): string {
  // Walk up until we find a sibling `manifest/` directory.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    try {
            const pkg = JSON.parse(
        readFileSync(resolve(dir, 'package.json'), 'utf-8')
      ) as { name?: string };
      if (pkg.name === '@manifest/stdlib') {
        return dir;
      }
    } catch {
      // keep walking
    }
    dir = dirname(dir);
  }
  // Fallback: assume standard layout
  return resolve(__dirname, '..', '..');
}

const ROOT = packageRoot();

/** Read a .manifest source file shipped with the package. */
export function readManifestSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, 'manifest', relativePath), 'utf-8');
}

/** Absolute filesystem path to a .manifest source file shipped with the package. */
export function manifestPath(relativePath: string): string {
  return resolve(ROOT, 'manifest', relativePath);
}

// --- Value objects ---------------------------------------------------------

export const moneySource = () => readManifestSource('values/money.manifest');
export const addressSource = () => readManifestSource('values/address.manifest');
export const emailSource = () => readManifestSource('values/email.manifest');
export const phoneSource = () => readManifestSource('values/phone.manifest');
export const auditTrailSource = () => readManifestSource('values/audit-trail.manifest');

// --- Enums -----------------------------------------------------------------

export const statusEnumSource = () => readManifestSource('enums/status.manifest');
export const priorityEnumSource = () => readManifestSource('enums/priority.manifest');
export const auditActionEnumSource = () => readManifestSource('enums/audit-action.manifest');

// --- Archetypes (reference patterns) ----------------------------------------

export const timestampedArchetypeSource = () =>
  readManifestSource('archetypes/timestamped.manifest');
export const softDeletableArchetypeSource = () =>
  readManifestSource('archetypes/soft-deletable.manifest');
export const ownedArchetypeSource = () =>
  readManifestSource('archetypes/owned.manifest');
export const auditableArchetypeSource = () =>
  readManifestSource('archetypes/auditable.manifest');
export const stateMachineArchetypeSource = () =>
  readManifestSource('archetypes/state-machine.manifest');

// --- Catalog ---------------------------------------------------------------

export interface ArchetypeEntry {
  name: string;
  description: string;
  sourcePath: string;
  get: () => string;
}

/**
 * Catalog of all stdlib archetypes. Use this to iterate programmatically
 * (e.g., to inject all archetypes into a generated docs site, or to
 * verify a fixture uses every standard pattern).
 */
export const ARCHETYPES: readonly ArchetypeEntry[] = [
  {
    name: 'Timestamped',
    description: 'Entity with auto-populated createdAt / updatedAt fields',
    sourcePath: 'archetypes/timestamped.manifest',
    get: timestampedArchetypeSource,
  },
  {
    name: 'SoftDeletable',
    description: 'Entity that is marked as deleted (deletedAt) rather than physically removed',
    sourcePath: 'archetypes/soft-deletable.manifest',
    get: softDeletableArchetypeSource,
  },
  {
    name: 'Owned',
    description: 'Entity owned by a user/tenant with ownership-transfer commands',
    sourcePath: 'archetypes/owned.manifest',
    get: ownedArchetypeSource,
  },
  {
    name: 'Auditable',
    description: 'Entity with actor + action + timestamp audit trail',
    sourcePath: 'archetypes/auditable.manifest',
    get: auditableArchetypeSource,
  },
  {
    name: 'StateMachine',
    description: 'Entity whose status is constrained by a transition table',
    sourcePath: 'archetypes/state-machine.manifest',
    get: stateMachineArchetypeSource,
  },
] as const;

export interface ValueObjectEntry {
  name: string;
  description: string;
  sourcePath: string;
  get: () => string;
}

export const VALUE_OBJECTS: readonly ValueObjectEntry[] = [
  {
    name: 'Money',
    description: 'Monetary amount with currency code',
    sourcePath: 'values/money.manifest',
    get: moneySource,
  },
  {
    name: 'Address',
    description: 'Postal address with country code',
    sourcePath: 'values/address.manifest',
    get: addressSource,
  },
  {
    name: 'EmailAddress',
    description: 'Email address with verification flag',
    sourcePath: 'values/email.manifest',
    get: emailSource,
  },
  {
    name: 'PhoneNumber',
    description: 'Phone number with country code and extension',
    sourcePath: 'values/phone.manifest',
    get: phoneSource,
  },
  {
    name: 'AuditTrail',
    description: 'Audit metadata: actor, action, timestamp, reason',
    sourcePath: 'values/audit-trail.manifest',
    get: auditTrailSource,
  },
] as const;

export interface EnumEntry {
  name: string;
  description: string;
  sourcePath: string;
  get: () => string;
}

export const ENUMS: readonly EnumEntry[] = [
  {
    name: 'Status',
    description: 'Common lifecycle status (draft/active/published/archived/deleted)',
    sourcePath: 'enums/status.manifest',
    get: statusEnumSource,
  },
  {
    name: 'Priority',
    description: 'Priority levels (low/medium/high/critical)',
    sourcePath: 'enums/priority.manifest',
    get: priorityEnumSource,
  },
  {
    name: 'AuditAction',
    description: 'Canonical audit action verbs',
    sourcePath: 'enums/audit-action.manifest',
    get: auditActionEnumSource,
  },
] as const;

import { STDLIB_VERSION } from './version.js';
export const VERSION = STDLIB_VERSION;
