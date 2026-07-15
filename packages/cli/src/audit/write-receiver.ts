/**
 * Shared construction of the direct-ORM-write regexes used by the governance
 * detectors.
 *
 * The receiver identifier (the client variable the write is called on) was
 * historically hardcoded as `prisma`. Consumers that re-export their client
 * under a different name (e.g. `database.user.create`) were invisible to the
 * detectors. `writeReceiver` on DetectorContext makes this configurable while
 * defaulting to `prisma` so existing behavior is unchanged.
 *
 * In addition to Prisma-style `<receiver>.<model>.<method>(`, the detector set
 * also matches Drizzle (`insert`/`update`/`delete`), Kysely (`insertInto` /
 * `updateTable` / `deleteFrom`), and raw SQL template literals that contain
 * INSERT/UPDATE/DELETE (2026-07-15).
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

export type DirectWriteFlavor = 'prisma' | 'drizzle' | 'kysely' | 'raw-sql';

export interface DirectWriteMatch {
  flavor: DirectWriteFlavor;
  /** Short label for the finding message (e.g. `prisma.create`, `drizzle.insert`). */
  label: string;
}

/**
 * Collects every direct-write shape for a configured receiver: Prisma-style
 * model methods, Drizzle insert/update/delete, Kysely insertInto/updateTable/
 * deleteFrom, and raw SQL template literals with DML verbs.
 */
export class DirectWriteScanner {
  private readonly receiver: string;

  constructor(receiver: string = DEFAULT_WRITE_RECEIVER) {
    this.receiver = receiver;
  }

  scan(content: string): DirectWriteMatch[] {
    const hits: DirectWriteMatch[] = [];
    const rx = escapeRegExp(this.receiver);

    const prisma = new RegExp(
      `\\b${rx}\\s*\\.\\s*\\w+\\s*\\.\\s*(${WRITE_METHODS})\\s*\\(`,
      'g',
    );
    for (const m of content.matchAll(prisma)) {
      hits.push({ flavor: 'prisma', label: `${this.receiver}.${m[1]}` });
    }

    const drizzle = new RegExp(
      `\\b${rx}\\s*\\.\\s*(insert|update|delete)\\s*\\(`,
      'g',
    );
    for (const m of content.matchAll(drizzle)) {
      hits.push({ flavor: 'drizzle', label: `drizzle.${m[1]}` });
    }

    const kysely = new RegExp(
      `\\b${rx}\\s*\\.\\s*(insertInto|updateTable|deleteFrom)\\s*\\(`,
      'g',
    );
    for (const m of content.matchAll(kysely)) {
      hits.push({ flavor: 'kysely', label: `kysely.${m[1]}` });
    }

    // Tagged or plain template literals that look like DML SQL.
    // Conservative: requires INSERT/UPDATE/DELETE as a word near the start of
    // the template body (after optional whitespace/comments).
    const rawSql = /(?:sql|query|execute)?\s*`[\s\n]*(?:\/\*[\s\S]*?\*\/\s*)?(INSERT|UPDATE|DELETE)\b/gi;
    for (const m of content.matchAll(rawSql)) {
      hits.push({ flavor: 'raw-sql', label: `raw-sql.${m[1]!.toLowerCase()}` });
    }

    return hits;
  }
}
