/**
 * Proven local Date / date-string sources for empty date-sentinel repairs.
 * Never invents literals — only reuses identifiers already in the consumer.
 */

export interface ProvenDateSource {
  /** Expression safe to splice into the payload (may include .toISOString()). */
  expression: string;
  /** Underlying local identifier. */
  identifier: string;
}

interface DateLocal {
  name: string;
  /** True when initialized with `new Date(...)` or proven Date methods. */
  isDateObject: boolean;
}

/**
 * Find a unique proven local date source for an empty date/datetime parameter.
 * Prefers stem affinity (dueByTime ↔ dueByDate) over generic date names.
 */
export function findProvenDateSource(
  content: string,
  param: string,
  opts?: { preferIsoString?: boolean },
): ProvenDateSource | undefined {
  const locals = collectDateLocals(content);
  if (locals.length === 0) {
    return fallbackNamedDateIdentifier(content, param, opts?.preferIsoString === true);
  }

  const paramStem = dateStem(param);
  const scored = locals
    .filter(l => l.name !== param)
    .map(l => ({
      local: l,
      score: scoreDateLocal(param, paramStem, l.name),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.local.name.localeCompare(b.local.name));

  if (scored.length === 0) {
    return fallbackNamedDateIdentifier(content, param, opts?.preferIsoString === true);
  }

  const best = scored[0]!;
  // Ambiguous when two locals share the top score
  if (scored.length > 1 && scored[1]!.score === best.score) {
    return undefined;
  }

  return toProvenExpression(best.local, opts?.preferIsoString === true);
}

function collectDateLocals(content: string): DateLocal[] {
  const out: DateLocal[] = [];
  const seen = new Set<string>();
  const decl =
    /\b(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*new\s+Date\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(content)) !== null) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, isDateObject: true });
  }

  // Locals mutated with Date methods prove Date even if init was copied
  const methodProof =
    /\b([A-Za-z_][\w]*)\.(?:setHours|setDate|setMonth|setFullYear|getTime|toISOString)\s*\(/g;
  while ((m = methodProof.exec(content)) !== null) {
    const name = m[1]!;
    if (seen.has(name)) continue;
    if (!new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(name)}\\s*=`).test(content)) {
      continue;
    }
    seen.add(name);
    out.push({ name, isDateObject: true });
  }

  return out;
}

function fallbackNamedDateIdentifier(
  content: string,
  param: string,
  preferIso: boolean,
): ProvenDateSource | undefined {
  const named = /\b(dueDate|date|scheduledFor|startsAt|endsAt)\b/.exec(content);
  if (!named || named[1] === param) return undefined;
  const id = named[1]!;
  if (!new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(id)}\\s*=`).test(content)) {
    return undefined;
  }
  const isDateObject = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRe(id)}\\s*=\\s*new\\s+Date\\s*\\(`,
  ).test(content);
  return toProvenExpression({ name: id, isDateObject }, preferIso);
}

function scoreDateLocal(param: string, paramStem: string, localName: string): number {
  if (localName === param) return 0;
  const localStem = dateStem(localName);
  if (paramStem && localStem && paramStem === localStem) return 100;
  // dueByTime ↔ dueBy (partial)
  if (paramStem && localName.toLowerCase().startsWith(paramStem)) return 80;
  if (localStem && param.toLowerCase().startsWith(localStem)) return 80;
  // Generic well-known date identifiers
  if (/^(dueDate|date|scheduledFor|startsAt|endsAt)$/.test(localName)) return 40;
  // *Date / *Time locals when param is also date-like named
  if (/Date$|Time$|At$/i.test(localName) && /Date$|Time$|At$/i.test(param)) return 20;
  return 0;
}

function dateStem(name: string): string {
  return name.replace(/(Date|Time|At|On)$/i, '').toLowerCase();
}

function toProvenExpression(
  local: DateLocal,
  preferIso: boolean,
): ProvenDateSource {
  if (preferIso && local.isDateObject) {
    return {
      expression: `${local.name}.toISOString()`,
      identifier: local.name,
    };
  }
  return { expression: local.name, identifier: local.name };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
