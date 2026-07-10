/**
 * Control-local helpers for wire-existing-control action-intent proof.
 *
 * Same entity / page / file-wide keywords are never enough. Evidence must
 * attach to the specific control being replaced.
 */

import type { WiringCommandDescriptor } from '../types.js';

/** Handlers that already perform a different meaningful product action. */
export const UNRELATED_HANDLER_RE =
  /\b(?:set(?:Error|Errors|Message|Messages|Toast|Alert|Open|IsOpen|Visible|Show|Showing|Modal|Dialog|Drawer|Menu|Popover|Tooltip|Loading|Busy|Pending|Selected|Selection|Filter|Filters|Query|Search|Tab|Step|Page|Index|Cursor|Hover|Focus|Expanded|Collapsed|Copied|Clipboard|Create\w*|Edit\w*|Add\w*|New\w*)\w*|set\w*(?:Dialog|Modal|Drawer|Open|Visible|Filter|Selected|Create|Edit)\w*)\s*\(|\b(?:router\.push|router\.replace|redirect|refresh|revalidate|console\.\w+)\s*\(/i;

export const DISMISS_LABEL_RE =
  /\b(dismiss|close|cancel|clear|ok|okay|got it|hide|x)\b/i;

/** Labels that mean create/open-new — never match non-create commands. */
export const CREATE_LABEL_RE =
  /\b(new\s+\w+|create(\s+\w+)?|add(\s+\w+)?|open\s+create|start\s+new)\b/i;

const MEANING_ALIASES: Record<string, string[]> = {
  complete: ['complete', 'completed', 'mark complete', 'mark completed', 'finish', 'done'],
  archive: ['archive', 'archived', 'archiving'],
  delete: ['delete', 'remove', 'destroy'],
  publish: ['publish', 'published', 'make public'],
  create: ['create', 'add', 'new', 'save new'],
  update: ['update', 'save', 'edit'],
  cancel: ['cancel', 'abort'],
  approve: ['approve', 'approval'],
  reject: ['reject', 'deny'],
  escalatetolegal: ['escalate to legal', 'send to legal', 'legal escalation'],
};

export interface ControlCandidate {
  handlerSnippet: string;
  labelText: string;
  /** Slice of source covering this control (attrs + body). */
  controlSource: string;
  /** Start index in file content. */
  index: number;
  matchKind: 'explicit-capability' | 'label' | 'handler-name';
}

export function entitySurfaceProven(entity: string, file: string, content: string): boolean {
  const norm = file.replace(/\\/g, '/').toLowerCase();
  const slug = entity
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  const camel = entity[0]!.toLowerCase() + entity.slice(1);
  if (norm.includes(slug) || norm.includes(entity.toLowerCase()) || norm.includes(camel.toLowerCase())) {
    return true;
  }
  if (new RegExp(`\\b${escape(entity)}\\b`).test(content)) return true;
  if (new RegExp(`\\b${escape(camel)}\\b`).test(content)) return true;
  return false;
}

/**
 * Find identity available at the control site (enclosing ~800 chars), not
 * merely somewhere else in a large file.
 */
export function findIdentityAtControlSite(
  cap: WiringCommandDescriptor,
  content: string,
  controlIndex: number,
  controlSource: string,
): string | undefined {
  const start = Math.max(0, controlIndex - 600);
  const end = Math.min(content.length, controlIndex + controlSource.length + 200);
  const window = content.slice(start, end);
  return findEntityIdentityIn(cap, window) ?? findEntityIdentityIn(cap, controlSource);
}

export function findEntityIdentityIn(
  cap: WiringCommandDescriptor,
  content: string,
): string | undefined {
  const entity = cap.entity;
  const camel = entity[0]!.toLowerCase() + entity.slice(1);
  const segments = entity.match(/[A-Z][a-z0-9]*/g) ?? [];
  const lastSegment = segments[segments.length - 1];
  const shortId = lastSegment
    ? `${lastSegment[0]!.toLowerCase()}${lastSegment.slice(1)}Id`
    : undefined;
  const ordered = [
    `${camel}Id`,
    `${entity}Id`,
    ...(shortId ? [shortId] : []),
    'entityId',
    'recordId',
    'self.id',
    'params.id',
    ...(shortId ? [`params.${shortId}`] : []),
    // Bare `id` only when clearly a binding (prop/const), not object keys alone.
    'id',
  ];
  for (const name of ordered) {
    if (name.includes('.')) {
      if (content.includes(name)) return name;
      continue;
    }
    if (name === 'id') {
      const propId = /\(\s*\{[^}]*\bid\s*[,}:]/.test(content) ||
        /\b(?:const|let|var)\s+id\b/.test(content) ||
        /\bfunction\s+\w+\s*\([^)]*\bid\b/.test(content);
      if (propId) return 'id';
      continue;
    }
    const decl = new RegExp(
      `\\b(?:const|let|var)\\s+${escape(name)}\\b|` +
        `\\b${escape(name)}\\s*[:=]|` +
        `\\(\\s*\\{[^}]*\\b${escape(name)}\\b|` +
        `\\bfunction\\s+\\w+\\s*\\([^)]*\\b${escape(name)}\\b`,
    );
    if (decl.test(content)) return name;
  }
  return undefined;
}

/** Scan for controls with exact action-intent for this capability. */
export function findActionIntentControls(
  cap: WiringCommandDescriptor,
  content: string,
): ControlCandidate[] {
  const out: ControlCandidate[] = [];
  const attr = `data-manifest-capability="${cap.capabilityId}"`;
  const buttonRe = /<(?:button|Button)\b([^>]*)>([\s\S]*?)<\/(?:button|Button)>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonRe.exec(content)) !== null) {
    const full = match[0]!;
    const attrs = match[1] ?? '';
    const rawBody = match[2] ?? '';
    const body = rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const aria = /aria-label\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    const labelText = body || aria;
    const handlerSnippet = extractHandler(attrs, full);
    const index = match.index;

    if (full.includes(attr) || attrs.includes(attr)) {
      out.push({
        handlerSnippet: handlerSnippet || 'noop',
        labelText: labelText || cap.command,
        controlSource: full,
        index,
        matchKind: 'explicit-capability',
      });
      continue;
    }

    if (labelMatchesCommand(cap, labelText)) {
      if (!handlerSnippet) continue;
      out.push({
        handlerSnippet,
        labelText,
        controlSource: full,
        index,
        matchKind: 'label',
      });
      continue;
    }

    if (handlerSnippet && handlerNameMatchesCommand(cap, handlerSnippet)) {
      out.push({
        handlerSnippet,
        labelText: labelText || cap.command,
        controlSource: full,
        index,
        matchKind: 'handler-name',
      });
    }
  }
  return out;
}

export function labelMatchesCommand(cap: WiringCommandDescriptor, label: string): boolean {
  if (!label.trim()) return false;
  const labelLower = label.toLowerCase();
  if (cap.command.toLowerCase() !== 'create' && CREATE_LABEL_RE.test(labelLower)) {
    return false;
  }
  if (DISMISS_LABEL_RE.test(labelLower)) return false;
  const aliases = meaningAliases(cap.command);
  // Prefer multi-word / longer aliases; require a real intent phrase, not a
  // single generic token that appears in unrelated copy.
  return aliases.some(a => {
    if (a.length < 4) return false;
    return labelLower.includes(a);
  });
}

export function handlerNameMatchesCommand(
  cap: WiringCommandDescriptor,
  handler: string,
): boolean {
  const cmd = cap.command;
  const patterns = [
    new RegExp(`\\bhandle${escape(cmd)}\\b`, 'i'),
    new RegExp(`\\bon${escape(cmd)}\\b`, 'i'),
    new RegExp(`\\b${escape(cmd)}\\b`, 'i'),
    new RegExp(
      `\\bset${escape(cmd[0]!.toUpperCase() + cmd.slice(1))}\\w*\\s*\\(`,
      'i',
    ),
  ];
  // Bare command token in handler is only OK when it's clearly a named handler,
  // not an arbitrary identifier collision.
  if (patterns[0]!.test(handler) || patterns[1]!.test(handler) || patterns[3]!.test(handler)) {
    return true;
  }
  return new RegExp(
    `\\b(?:const|let|function)\\s+${escape(cmd)}\\b|\\b${escape(cmd)}\\s*=\\s*(?:async\\s*)?(?:\\(|function)`,
    'i',
  ).test(handler);
}

export function classifyUnrelatedHandler(handler: string, label?: string): string | null {
  if (label && DISMISS_LABEL_RE.test(label)) {
    return `Control label "${label}" is unrelated local UI (dismiss/close), not the command`;
  }
  if (label && CREATE_LABEL_RE.test(label)) {
    return `Control label "${label}" opens/creates a record; not an instance action surface`;
  }
  if (UNRELATED_HANDLER_RE.test(handler)) {
    return `Handler already performs a different product action and must not be replaced`;
  }
  if (/\bsetError\s*\(\s*null\s*\)/.test(handler)) {
    return `Handler is error-dismiss (setError(null)); not a command surface`;
  }
  if (/\bsetCreate\w*\s*\(/.test(handler) || /\bset\w*Dialog\w*\s*\(/.test(handler)) {
    return `Handler opens a create/dialog flow; not a command surface`;
  }
  return null;
}

export function inputsBuildable(
  cap: WiringCommandDescriptor,
  content: string,
  identity: string | undefined,
): boolean {
  const clientRequired = cap.parameters.filter(p => p.ownership === 'client' && p.required);
  if (clientRequired.length === 0) return true;
  for (const p of clientRequired) {
    if (p.name === 'id' && identity) continue;
    const present =
      new RegExp(`\\b${escape(p.name)}\\b`).test(content) ||
      (identity !== undefined && p.name.toLowerCase().endsWith('id'));
    if (!present) return false;
  }
  return true;
}

export function clientFn(entity: string, command: string): string {
  return `${entity[0]!.toLowerCase()}${entity.slice(1)}${command[0]!.toUpperCase()}${command.slice(1)}`;
}

export function bindingHasInstanceIdentity(
  content: string,
  bindingCallee: string,
  identityExpression?: string,
): boolean {
  const callRe = new RegExp(`${escape(bindingCallee)}\\s*\\(([^)]*)\\)`);
  const m = callRe.exec(content);
  if (!m) return false;
  const args = (m[1] ?? '').trim();
  if (!args || args === '{}' || args === 'undefined') return false;
  if (identityExpression && args.includes(identityExpression)) return true;
  return /\bid\s*:/.test(args);
}

export function wiredControlLabel(
  content: string,
  bindingCallee: string,
): string | undefined {
  const re = new RegExp(
    `<(?:button|Button)\\b[^>]*${escape(bindingCallee)}[\\s\\S]*?>\\s*([\\s\\S]*?)\\s*</(?:button|Button)>`,
    'i',
  );
  const m = re.exec(content);
  if (!m?.[1]) {
    // Handler may be multi-line; search nearby after callee
    const idx = content.indexOf(bindingCallee);
    if (idx < 0) return undefined;
    const window = content.slice(idx, idx + 400);
    const close = />\s*([\s\S]*?)\s*<\//.exec(window);
    return close?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function meaningAliases(command: string): string[] {
  const key = command.toLowerCase();
  const compact = key.replace(/[^a-z0-9]/g, '');
  const extra = MEANING_ALIASES[key] ?? MEANING_ALIASES[compact] ?? [];
  const spaced = command.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return [...new Set([spaced, ...extra].filter(a => a.length >= 4))];
}

function extractHandler(attrs: string, full: string): string {
  const fromAttrs =
    /(?:onClick|onPress)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/.exec(attrs)?.[1]?.trim() ??
    /(?:onClick|onPress)\s*=\s*\{?\s*([A-Za-z_$][\w$]*)\s*\}?/.exec(attrs)?.[1]?.trim();
  if (fromAttrs) return fromAttrs;
  return (
    /(?:onClick|onPress)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/.exec(full)?.[1]?.trim() ??
    /(?:onClick|onPress)\s*=\s*\{?\s*([A-Za-z_$][\w$]*)\s*\}?/.exec(full)?.[1]?.trim() ??
    ''
  );
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
