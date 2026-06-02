import {
  DocumentSymbol,
  SymbolKind,
  Range,
  Position,
} from 'vscode-languageserver/node';
import type { ManifestProgram, EntityNode, CommandNode, PolicyNode, EnumNode, ModuleNode } from '@angriff36/manifest/compiler';

function posRange(node: { position?: { line: number; column: number } }): Range {
  if (!node.position) return Range.create(0, 0, 0, 0);
  const line = node.position.line - 1;
  const col = node.position.column - 1;
  return Range.create(Position.create(line, col), Position.create(line, col));
}

function entitySymbol(entity: EntityNode): DocumentSymbol {
  const range = posRange(entity);
  const children: DocumentSymbol[] = [];

  for (const prop of entity.properties) {
    children.push(
      DocumentSymbol.create(
        prop.name,
        prop.dataType.name,
        SymbolKind.Property,
        posRange(prop),
        posRange(prop),
      ),
    );
  }

  for (const comp of entity.computedProperties) {
    children.push(
      DocumentSymbol.create(
        comp.name,
        `computed ${comp.dataType.name}`,
        SymbolKind.Property,
        posRange(comp),
        posRange(comp),
      ),
    );
  }

  for (const cmd of entity.commands) {
    children.push(commandSymbol(cmd));
  }

  for (const rel of entity.relationships) {
    children.push(
      DocumentSymbol.create(
        rel.name,
        `${rel.kind} -> ${rel.target}`,
        SymbolKind.Field,
        posRange(rel),
        posRange(rel),
      ),
    );
  }

  for (const pol of entity.policies) {
    children.push(policySymbol(pol));
  }

  for (const con of entity.constraints) {
    children.push(
      DocumentSymbol.create(
        con.name,
        con.severity ?? 'block',
        SymbolKind.Constant,
        posRange(con),
        posRange(con),
      ),
    );
  }

  return DocumentSymbol.create(
    entity.name,
    'entity',
    SymbolKind.Class,
    range,
    range,
    children,
  );
}

function commandSymbol(cmd: CommandNode): DocumentSymbol {
  const params = cmd.parameters.map((p) => `${p.name}: ${p.dataType.name}`).join(', ');
  return DocumentSymbol.create(
    cmd.name,
    `(${params})`,
    SymbolKind.Method,
    posRange(cmd),
    posRange(cmd),
  );
}

function policySymbol(pol: PolicyNode): DocumentSymbol {
  return DocumentSymbol.create(
    pol.name,
    pol.action,
    SymbolKind.Interface,
    posRange(pol),
    posRange(pol),
  );
}

function enumSymbol(en: EnumNode): DocumentSymbol {
  const children = en.values.map((v) =>
    DocumentSymbol.create(
      v.name,
      '',
      SymbolKind.EnumMember,
      posRange(v),
      posRange(v),
    ),
  );
  return DocumentSymbol.create(
    en.name,
    'enum',
    SymbolKind.Enum,
    posRange(en),
    posRange(en),
    children,
  );
}

function moduleSymbol(mod: ModuleNode): DocumentSymbol {
  const children: DocumentSymbol[] = [];
  for (const e of mod.entities) children.push(entitySymbol(e));
  for (const en of mod.enums) children.push(enumSymbol(en));
  for (const cmd of mod.commands) children.push(commandSymbol(cmd));
  for (const pol of mod.policies) children.push(policySymbol(pol));
  return DocumentSymbol.create(
    mod.name,
    'module',
    SymbolKind.Module,
    posRange(mod),
    posRange(mod),
    children,
  );
}

export function getDocumentSymbols(program: ManifestProgram): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const mod of program.modules) symbols.push(moduleSymbol(mod));
  for (const entity of program.entities) symbols.push(entitySymbol(entity));
  for (const en of program.enums) symbols.push(enumSymbol(en));
  for (const cmd of program.commands) symbols.push(commandSymbol(cmd));
  for (const pol of program.policies) symbols.push(policySymbol(pol));

  for (const store of program.stores) {
    symbols.push(
      DocumentSymbol.create(
        store.entity,
        store.target,
        SymbolKind.Struct,
        posRange(store),
        posRange(store),
      ),
    );
  }

  for (const evt of program.events) {
    symbols.push(
      DocumentSymbol.create(
        evt.name,
        evt.channel,
        SymbolKind.Event,
        posRange(evt),
        posRange(evt),
      ),
    );
  }

  return symbols;
}
