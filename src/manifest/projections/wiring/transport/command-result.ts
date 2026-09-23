/**
 * Command success types for the wiring contract.
 * These match the Convex mutation return, not an unused `returns` clause.
 */

import type { IREntity, IRType } from '../../../ir.js';
import type { CommandSuccessShape } from './instance-target.js';

export type WiringResultKind = 'created' | 'allocation' | 'instance' | 'empty';

export interface WiringCommandResult {
  resultKind: WiringResultKind;
  returnTsType: string;
}

/** Maps a command to the success payload the Convex dispatcher actually returns. */
export class CommandResultShape {
  static from(input: {
    entity: IREntity | undefined;
    successShape: CommandSuccessShape;
    typeToTs: (type: IRType) => string;
  }): WiringCommandResult {
    if (input.successShape === 'empty') {
      return { resultKind: 'empty', returnTsType: 'void' };
    }
    if (input.successShape === 'docId') {
      return { resultKind: 'allocation', returnTsType: '{ docId: string }' };
    }
    return {
      resultKind: input.successShape === 'created' ? 'created' : 'instance',
      returnTsType: this.documentType(
        input.entity,
        input.typeToTs,
        input.successShape === 'instance',
      ),
    };
  }

  /** Stored public fields. Create has no `_creationTime`; a loaded document does. */
  private static documentType(
    entity: IREntity | undefined,
    typeToTs: (type: IRType) => string,
    loaded: boolean,
  ): string {
    const fields = ['_id: string'];
    if (loaded) fields.push('_creationTime: number');
    for (const property of entity?.properties ?? []) {
      if (property.name === 'id' || property.modifiers.includes('private')) continue;
      fields.push(`${property.name}: ${this.storedTs(property.type, typeToTs)}`);
    }
    return `{ ${fields.join('; ')} }`;
  }

  /** Convex stores dates as epoch milliseconds, so a result date is a number. */
  private static storedTs(type: IRType, typeToTs: (type: IRType) => string): string {
    if (this.isEpoch(type.name)) return type.nullable ? 'number | null' : 'number';
    const element = type.generic;
    if ((type.name === 'array' || type.name === 'list') && element && this.isEpoch(element.name)) {
      const inner = element.nullable ? '(number | null)[]' : 'number[]';
      return type.nullable ? `${inner} | null` : inner;
    }
    return typeToTs(type);
  }

  private static isEpoch(name: string): boolean {
    return name === 'date' || name === 'datetime' || name === 'timestamp' || name === 'time';
  }
}
