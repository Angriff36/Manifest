import {
  CommandNode,
  ComputedPropertyNode,
  EntityNode,
  ManifestProgram,
  PropertyNode,
  RelationshipNode,
  TypeNode,
} from './types';

/**
 * Expand generic entity templates (`entity Name<T>`) and instantiations
 * (`entity Alias = Name<Concrete>`). Templates are compile-time only and are
 * removed from the program before IR emission. Instantiation bodies merge with
 * substituted template members (own members win on name conflict).
 */

export function expandEntityGenerics(
  program: ManifestProgram,
  emitDiagnostic: (severity: 'error' | 'warning', message: string) => void,
): void {
  const entityLists: EntityNode[][] = [program.entities];
  for (const module of program.modules) {
    entityLists.push(module.entities);
  }

  const entityIndex = new Map<string, EntityNode>();
  for (const list of entityLists) {
    for (const entity of list) {
      entityIndex.set(entity.name, entity);
    }
  }

  for (const list of entityLists) {
    for (const entity of list) {
      if (entity.typeParams && entity.typeParams.length > 0 && entity.genericAlias) {
        emitDiagnostic(
          'error',
          `Entity '${entity.name}' cannot declare both type parameters and a generic instantiation`,
        );
        continue;
      }
      if (entity.genericAlias) {
        expandInstantiation(entity, entityIndex, emitDiagnostic);
      }
    }
  }

  for (const list of entityLists) {
    const concrete = list.filter((entity) => !entity.typeParams || entity.typeParams.length === 0);
    list.length = 0;
    list.push(...concrete);
  }
}

function expandInstantiation(
  entity: EntityNode,
  entityIndex: Map<string, EntityNode>,
  emitDiagnostic: (severity: 'error' | 'warning', message: string) => void,
): void {
  const alias = entity.genericAlias!;
  const template = entityIndex.get(alias.template);
  if (!template) {
    emitDiagnostic(
      'error',
      `Entity '${entity.name}' instantiates unknown entity '${alias.template}'`,
    );
    delete entity.genericAlias;
    return;
  }

  const typeParams = template.typeParams ?? [];
  if (typeParams.length === 0) {
    emitDiagnostic(
      'error',
      `Entity '${entity.name}' instantiates '${alias.template}' which is not a generic entity`,
    );
    delete entity.genericAlias;
    return;
  }

  if (alias.typeArgs.length !== typeParams.length) {
    emitDiagnostic(
      'error',
      `Entity '${entity.name}' instantiation of '${alias.template}' expects ${typeParams.length} type argument(s), got ${alias.typeArgs.length}`,
    );
    delete entity.genericAlias;
    return;
  }

  const subst = new Map<string, string>();
  for (let i = 0; i < typeParams.length; i++) {
    subst.set(typeParams[i], alias.typeArgs[i]);
  }

  const ownPropNames = new Set(entity.properties.map((p) => p.name));
  const ownComputedNames = new Set(entity.computedProperties.map((c) => c.name));
  const ownRelNames = new Set(entity.relationships.map((r) => r.name));
  const ownConstraintNames = new Set(entity.constraints.map((c) => c.name));
  const ownPolicyNames = new Set(entity.policies.map((p) => p.name));
  const ownCommandNames = new Set(entity.commands.map((c) => c.name));

  entity.properties = [
    ...cloneProperties(template.properties, subst).filter((p) => !ownPropNames.has(p.name)),
    ...entity.properties,
  ];
  entity.computedProperties = [
    ...cloneComputed(template.computedProperties, subst).filter(
      (c) => !ownComputedNames.has(c.name),
    ),
    ...entity.computedProperties,
  ];
  entity.relationships = [
    ...cloneRelationships(template.relationships, subst).filter((r) => !ownRelNames.has(r.name)),
    ...entity.relationships,
  ];
  entity.constraints = [
    ...structuredClone(template.constraints).filter((c) => !ownConstraintNames.has(c.name)),
    ...entity.constraints,
  ];
  entity.policies = [
    ...structuredClone(template.policies).filter((p) => !ownPolicyNames.has(p.name)),
    ...entity.policies,
  ];
  entity.commands = [
    ...cloneCommands(template.commands, subst).filter((c) => !ownCommandNames.has(c.name)),
    ...entity.commands,
  ];

  if (!entity.parent && template.parent) entity.parent = template.parent;
  if (!entity.mixins && template.mixins) entity.mixins = [...template.mixins];
  if (entity.store === undefined && template.store !== undefined) entity.store = template.store;
  if (!entity.key && template.key) entity.key = [...template.key];
  if (entity.timestamps === undefined && template.timestamps !== undefined) {
    entity.timestamps = template.timestamps;
  }
  if (entity.realtime === undefined && template.realtime !== undefined) {
    entity.realtime = template.realtime;
  }

  delete entity.genericAlias;
}

function cloneProperties(properties: PropertyNode[], subst: Map<string, string>): PropertyNode[] {
  return properties.map((property) => {
    const cloned = structuredClone(property);
    applyTypeSubstitution(cloned.dataType, subst);
    return cloned;
  });
}

function cloneComputed(
  computed: ComputedPropertyNode[],
  subst: Map<string, string>,
): ComputedPropertyNode[] {
  return computed.map((property) => {
    const cloned = structuredClone(property);
    applyTypeSubstitution(cloned.dataType, subst);
    return cloned;
  });
}

function cloneRelationships(
  relationships: RelationshipNode[],
  subst: Map<string, string>,
): RelationshipNode[] {
  return relationships.map((relationship) => {
    const cloned = structuredClone(relationship);
    const replaced = subst.get(cloned.target);
    if (replaced) cloned.target = replaced;
    return cloned;
  });
}

function cloneCommands(commands: CommandNode[], subst: Map<string, string>): CommandNode[] {
  return commands.map((command) => {
    const cloned = structuredClone(command);
    for (const parameter of cloned.parameters) {
      applyTypeSubstitution(parameter.dataType, subst);
    }
    if (cloned.returns) applyTypeSubstitution(cloned.returns, subst);
    return cloned;
  });
}

function applyTypeSubstitution(type: TypeNode, subst: Map<string, string>): void {
  const replaced = subst.get(type.name);
  if (replaced) type.name = replaced;
  if (type.generic) applyTypeSubstitution(type.generic, subst);
}
