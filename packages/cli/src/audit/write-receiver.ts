/**
 * Shared construction of the direct-ORM-write regexes used by the governance
 * detectors.
 *
 * The receiver identifier (the client variable the write is called on) was
 * historically hardcoded as `prisma`. Consumers that re-export their client
 * under a different name (e.g. `database.user.create`) were invisible to the
 * detectors. `writeReceiver` on DetectorContext makes this configurable while
 * defaulting to `prisma` so existing behavior is unchanged.
 */

export const DEFAULT_WRITE_RECEIVER = 'prisma';

const WRITE_METHODS = 'create|update|delete|upsert|createMany|updateMany|deleteMany';

/** Escape a string for safe interpolation into a RegExp source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches `<receiver>.<model>.<writeMethod>(` and captures the write method in
 * group 1. Non-global (first match wins) — used by the direct-writes detector.
 */
export function buildDirectWriteRegex(receiver: string = DEFAULT_WRITE_RECEIVER): RegExp {
  return new RegExp(
    `\\b${escapeRegExp(receiver)}\\s*\\.\\s*\\w+\\s*\\.\\s*(${WRITE_METHODS})\\s*\\(`,
  );
}

/**
 * Matches `<receiver>.<model>.<writeMethod>(` and captures the model in group 1
 * and the method in group 2. Global — used by the unregistered-entity-write
 * detector to enumerate every write in a file.
 */
export function buildEntityWriteRegex(receiver: string = DEFAULT_WRITE_RECEIVER): RegExp {
  return new RegExp(
    `\\b${escapeRegExp(receiver)}\\s*\\.\\s*(\\w+)\\s*\\.\\s*(${WRITE_METHODS})\\s*\\(`,
    'g',
  );
}
