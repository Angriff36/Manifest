import {
  Location,
  Position,
  Range,
} from 'vscode-languageserver/node';
import type { ManifestProgram } from '@angriff36/manifest/compiler';

/**
 * Find the word at a cursor position in source text.
 */
function getWordAtPosition(text: string, position: Position): string | null {
  const lines = text.split('\n');
  if (position.line >= lines.length) return null;
  const line = lines[position.line];
  const col = position.character;

  let start = col;
  while (start > 0 && /\w/.test(line[start - 1])) start--;
  let end = col;
  while (end < line.length && /\w/.test(line[end])) end++;

  if (start === end) return null;
  return line.substring(start, end);
}

/**
 * Go-to-definition: resolve entity/enum name references to their declaration.
 * Intra-file only (single-document scope).
 */
export function getDefinition(
  program: ManifestProgram,
  text: string,
  uri: string,
  position: Position,
): Location | null {
  const word = getWordAtPosition(text, position);
  if (!word) return null;

  // Search entities (top-level and in modules)
  const allEntities = [
    ...program.entities,
    ...program.modules.flatMap((m) => m.entities),
  ];
  for (const entity of allEntities) {
    if (entity.name === word && entity.position) {
      return Location.create(
        uri,
        Range.create(
          Position.create(entity.position.line - 1, entity.position.column - 1),
          Position.create(entity.position.line - 1, entity.position.column - 1 + entity.name.length),
        ),
      );
    }
  }

  // Search enums
  const allEnums = [
    ...program.enums,
    ...program.modules.flatMap((m) => m.enums),
  ];
  for (const en of allEnums) {
    if (en.name === word && en.position) {
      return Location.create(
        uri,
        Range.create(
          Position.create(en.position.line - 1, en.position.column - 1),
          Position.create(en.position.line - 1, en.position.column - 1 + en.name.length),
        ),
      );
    }
  }

  // Search modules
  for (const mod of program.modules) {
    if (mod.name === word && mod.position) {
      return Location.create(
        uri,
        Range.create(
          Position.create(mod.position.line - 1, mod.position.column - 1),
          Position.create(mod.position.line - 1, mod.position.column - 1 + mod.name.length),
        ),
      );
    }
  }

  return null;
}
