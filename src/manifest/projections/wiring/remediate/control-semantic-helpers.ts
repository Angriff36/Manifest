/**
 * Helpers for wire-existing-control semantic matching.
 */

import type { WiringCommandDescriptor } from '../types.js';

/** Handlers that clear/dismiss local UI state — never command surfaces. */
export const UNRELATED_HANDLER_RE =
  /\bset(?:Error|Errors|Message|Messages|Toast|Alert|Open|IsOpen|Visible|Show|Showing|Modal|Dialog|Drawer|Menu|Popover|Tooltip|Loading|Busy|Pending|Selected|Selection|Filter|Filters|Query|Search|Tab|Step|Page|Index|Cursor|Hover|Focus|Expanded|Collapsed|Copied|Clipboard)\s*\(/i;

export const DISMISS_LABEL_RE =
  /\b(dismiss|close|cancel|clear|ok|okay|got it|hide|x)\b/i;

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
};

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

export function findEntityIdentity(
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
    'id',
  ];
  for (const name of ordered) {
    if (name.includes('.')) {
      if (content.includes(name)) return name;
      continue;
    }
    const decl = new RegExp(
      `\\b(?:const|let|var)\\s+${escape(name)}\\b|` +
        `\\b${escape(name)}\\s*[:=]|` +
        `\\(\\s*\\{[^}]*\\b${escape(name)}\\b|` +
        `\\b${escape(name)}\\s*\\}|` +
        `\\bfunction\\s+\\w+\\s*\\([^)]*\\b${escape(name)}\\b`,
    );
    if (decl.test(content)) return name;
  }
  return undefined;
}

export function findExplicitCapabilityControl(
  cap: WiringCommandDescriptor,
  content: string,
): { handlerSnippet: string; labelText?: string } | null {
  const attr = `data-manifest-capability="${cap.capabilityId}"`;
  const idx = content.indexOf(attr);
  if (idx < 0) return null;
  const window = content.slice(Math.max(0, idx - 200), idx + 400);
  const handler =
    /(?:onClick|onPress)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/.exec(window)?.[1]?.trim() ??
    /(?:onClick|onPress)\s*=\s*\{?\s*(noop|undefined)\s*\}?/.exec(window)?.[0] ??
    '';
  const labelText =
    />\s*([^<{]+?)\s*<\//.exec(window)?.[1]?.trim() ??
    /aria-label\s*=\s*["']([^"']+)["']/.exec(window)?.[1];
  return { handlerSnippet: handler || 'noop', labelText };
}

export function findMeaningMatchedControl(
  cap: WiringCommandDescriptor,
  content: string,
): {
  handlerSnippet: string;
  labelText?: string;
  strongMeaning: boolean;
} | null {
  const aliases = meaningAliases(cap.command);
  const localOnly =
    content.includes('// local-only') || content.includes(`TODO wire ${cap.capabilityId}`);

  const buttonRe = /<(?:button|Button)\b([^>]*)>([\s\S]*?)<\/(?:button|Button)>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonRe.exec(content)) !== null) {
    const attrs = match[1] ?? '';
    const body = (match[2] ?? '').replace(/<[^>]+>/g, ' ').trim();
    const aria = /aria-label\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    const labelText = body || aria;
    if (!labelText) continue;

    const labelLower = labelText.toLowerCase();
    const meaningHit = aliases.some(a => labelLower.includes(a));
    if (!meaningHit && !localOnly) continue;

    const handlerMatch =
      /(?:onClick|onPress)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/.exec(attrs) ||
      /(?:onClick|onPress)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/.exec(match[0]!);
    const handlerSnippet = handlerMatch?.[1]?.trim() ?? '';
    if (!handlerSnippet) continue;

    const commandSetter = new RegExp(
      `\\bset${escape(cap.command[0]!.toUpperCase() + cap.command.slice(1))}\\w*\\s*\\(`,
      'i',
    );
    const strongMeaning =
      localOnly ||
      commandSetter.test(handlerSnippet) ||
      (meaningHit && !DISMISS_LABEL_RE.test(labelText));

    if (!strongMeaning) continue;
    return { handlerSnippet, labelText, strongMeaning: true };
  }
  return null;
}

export function controlLabelMatchesCommand(
  cap: WiringCommandDescriptor,
  content: string,
): boolean {
  const aliases = meaningAliases(cap.command);
  const buttonRe = /<(?:button|Button)\b[^>]*>([\s\S]*?)<\/(?:button|Button)>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonRe.exec(content)) !== null) {
    const body = (match[1] ?? '').replace(/<[^>]+>/g, ' ').trim().toLowerCase();
    if (aliases.some(a => body.includes(a)) && !DISMISS_LABEL_RE.test(body)) {
      return true;
    }
  }
  return false;
}

export function bindingAttachedToDismissLabel(
  content: string,
  bindingCallee: string,
): boolean {
  const re = new RegExp(
    `<(?:button|Button)\\b[^>]*${escape(bindingCallee)}[^>]*>\\s*([^<{]*?)\\s*</(?:button|Button)>`,
    'i',
  );
  const m = re.exec(content);
  if (m?.[1] && DISMISS_LABEL_RE.test(m[1])) return true;
  const re2 = new RegExp(
    `${escape(bindingCallee)}\\s*\\([\\s\\S]{0,120}?>\\s*(Dismiss|Close|Cancel|Clear)\\s*<`,
    'i',
  );
  return re2.test(content);
}

export function classifyUnrelatedHandler(handler: string, label?: string): string | null {
  if (label && DISMISS_LABEL_RE.test(label)) {
    return `Control label "${label}" is unrelated local UI (dismiss/close), not the command`;
  }
  if (UNRELATED_HANDLER_RE.test(handler)) {
    return `Handler clears unrelated local UI state and must not be replaced by a command`;
  }
  if (/\bsetError\s*\(\s*null\s*\)/.test(handler)) {
    return `Handler is error-dismiss (setError(null)); not a command surface`;
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

function meaningAliases(command: string): string[] {
  const key = command.toLowerCase();
  const extra = MEANING_ALIASES[key] ?? [];
  const spaced = command.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return [...new Set([key, spaced, command.toLowerCase(), ...extra])];
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
