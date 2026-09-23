/**
 * Reads the Convex query generator already emits for stored records.
 * List and get take no cursor. Indexed reads take the index fields.
 */

import type { IR, IREntity, IRType } from '../../../ir.js';
import { isPersistentEntity } from '../../convex/persist.js';
import { generatedReadIndexes } from '../../convex/functions.js';
import { resolveConvexReadVisibility } from '../../convex/read-policies.js';
import type { WiringReadDescriptor, WiringReadParameter } from '../types.js';
import { CommandResultShape } from '../transport/command-result.js';

/** Builds the read side of a wiring contract from the same query names Convex emits. */
export class ReadCatalog {
  static from(
    ir: IR,
    authContextImport: string | undefined,
    typeToTs: (type: IRType) => string,
  ): WiringReadDescriptor[] {
    const reads: WiringReadDescriptor[] = [];
    const entities = ir.entities
      .filter((entity) => isPersistentEntity(entity, ir))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entity of entities) {
      const callable = this.callable(ir, entity.name, authContextImport);
      const document = CommandResultShape.from({
        entity,
        successShape: 'instance',
        typeToTs,
      }).returnTsType;
      reads.push(this.list(entity, callable, document));
      reads.push(this.detail(entity, callable, document));
    }
    for (const index of generatedReadIndexes(ir, { authContextImport })) {
      const entity = entities.find((item) => item.name === index.entity);
      if (!entity) continue;
      reads.push(this.indexed(ir, entity, index, authContextImport, typeToTs));
    }
    return reads.sort((left, right) => left.readId.localeCompare(right.readId));
  }

  private static callable(
    ir: IR,
    entityName: string,
    authContextImport: string | undefined,
  ): boolean {
    return resolveConvexReadVisibility(ir, entityName, authContextImport).clientReadable;
  }

  private static list(
    entity: IREntity,
    clientCallable: boolean,
    document: string,
  ): WiringReadDescriptor {
    return {
      entity: entity.name,
      readId: `${entity.name}.list`,
      exportName: `list${entity.name}`,
      kind: 'list',
      clientCallable,
      pagination: 'unsupported',
      parameters: [],
      returnTsType: `Array<${document}>`,
    };
  }

  private static detail(
    entity: IREntity,
    clientCallable: boolean,
    document: string,
  ): WiringReadDescriptor {
    return {
      entity: entity.name,
      readId: `${entity.name}.get`,
      exportName: `get${entity.name}`,
      kind: 'detail',
      clientCallable,
      pagination: 'unsupported',
      parameters: [{ name: 'id', tsType: 'string', required: true }],
      returnTsType: `${document} | null`,
    };
  }

  private static indexed(
    ir: IR,
    entity: IREntity,
    index: { entity: string; exportName: string; fields: { name: string; optional: boolean }[] },
    authContextImport: string | undefined,
    typeToTs: (type: IRType) => string,
  ): WiringReadDescriptor {
    const document = CommandResultShape.from({
      entity,
      successShape: 'instance',
      typeToTs,
    }).returnTsType;
    const suffix = index.exportName.slice(`list${entity.name}`.length);
    return {
      entity: entity.name,
      readId: `${entity.name}.${suffix.charAt(0).toLowerCase()}${suffix.slice(1)}`,
      exportName: index.exportName,
      kind: 'indexed',
      clientCallable: this.callable(ir, entity.name, authContextImport),
      pagination: 'unsupported',
      parameters: index.fields.map((field) => this.parameter(entity, field, typeToTs)),
      returnTsType: `Array<${document}>`,
    };
  }

  private static parameter(
    entity: IREntity,
    field: { name: string; optional: boolean },
    typeToTs: (type: IRType) => string,
  ): WiringReadParameter {
    const property = entity.properties.find((item) => item.name === field.name);
    return {
      name: field.name,
      tsType: property ? this.argumentTs(property.type, typeToTs) : 'string',
      required: !field.optional,
    };
  }

  /** Query arguments use the stored value. Dates are epoch milliseconds. */
  private static argumentTs(type: IRType, typeToTs: (type: IRType) => string): string {
    if (this.isEpoch(type.name)) return type.nullable ? 'number | null' : 'number';
    return typeToTs(type);
  }

  private static isEpoch(name: string): boolean {
    return name === 'date' || name === 'datetime' || name === 'timestamp' || name === 'time';
  }
}
