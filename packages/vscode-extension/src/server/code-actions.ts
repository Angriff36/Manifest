import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
} from 'vscode-languageserver/node';

interface ManifestFix {
  kind: 'replaceType' | 'renameField';
  replacement: string;
  range: Diagnostic['range'];
}

export function getCodeActions(uri: string, diagnostics: Diagnostic[]): CodeAction[] {
  return diagnostics.flatMap((diagnostic) => {
    const fix = readFix(diagnostic);
    if (!fix) return [];

    return [CodeAction.create(
      titleForFix(fix),
      {
        changes: {
          [uri]: [
            {
              range: fix.range,
              newText: fix.replacement,
            },
          ],
        },
      },
      CodeActionKind.QuickFix,
    )];
  });
}

function readFix(diagnostic: Diagnostic): ManifestFix | undefined {
  const data = diagnostic.data as { fix?: ManifestFix } | undefined;
  return data?.fix;
}

function titleForFix(fix: ManifestFix): string {
  if (fix.kind === 'renameField') return `Rename event payload field to ${fix.replacement}`;
  return `Change number to ${fix.replacement}`;
}
