/**
 * Which stored-record reads go stale when a command runs.
 * The command's own record, records it points at, records that point at it,
 * and records a declared reaction will change.
 */

import type { IR, IRCommand } from '../../../ir.js';
import type { WiringInvalidationTarget } from '../types.js';

/** Builds invalidation from declared relationships and reactions. */
export class RelatedReadInvalidation {
  static forCommand(ir: IR, command: IRCommand, entityName: string): WiringInvalidationTarget[] {
    if (!entityName || entityName === '_program') return [];
    const names = new Set<string>([entityName]);
    this.addRelationships(ir, entityName, names);
    this.addReactions(ir, command, names);
    const related = [...names].filter((name) => name !== entityName).sort();
    return [entityName, ...related].flatMap((name) => this.pair(name, name === entityName));
  }

  private static addRelationships(ir: IR, entityName: string, names: Set<string>): void {
    const entity = ir.entities.find((item) => item.name === entityName);
    for (const relation of entity?.relationships ?? []) {
      this.addIfEntity(ir, relation.target, names);
      this.addIfEntity(ir, relation.through, names);
    }
    for (const other of ir.entities) {
      if (other.name === entityName) continue;
      for (const relation of other.relationships) {
        if (relation.target === entityName || relation.through === entityName) {
          names.add(other.name);
        }
      }
    }
  }

  private static addReactions(ir: IR, command: IRCommand, names: Set<string>): void {
    const emitted = new Set(command.emits ?? []);
    if (emitted.size === 0) return;
    for (const reaction of ir.reactions ?? []) {
      if (!emitted.has(reaction.event)) continue;
      this.addIfEntity(ir, reaction.targetEntity, names);
      this.addIfEntity(ir, reaction.fanOut?.matchEntity, names);
    }
  }

  private static addIfEntity(ir: IR, name: string | undefined, names: Set<string>): void {
    if (!name) return;
    if (!ir.entities.some((entity) => entity.name === name)) return;
    names.add(name);
  }

  private static pair(entityName: string, own: boolean): WiringInvalidationTarget[] {
    const camel = entityName ? entityName[0].toLowerCase() + entityName.slice(1) : entityName;
    const ownLabel = own ? '' : 'related ';
    return [
      {
        kind: 'entityList',
        entity: entityName,
        queryKeyHint: `queryKeys.${camel}.lists()`,
        readId: `${entityName}.list`,
        label: `${ownLabel}entity list`,
      },
      {
        kind: 'entityDetail',
        entity: entityName,
        queryKeyHint: `queryKeys.${camel}.detail(id)`,
        readId: `${entityName}.get`,
        label: `${ownLabel}entity detail`,
      },
    ];
  }
}
