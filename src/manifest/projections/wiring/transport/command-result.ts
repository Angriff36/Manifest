/**
 * Command success types for the wiring contract.
 * A missing `returns` clause is a real empty or structural result, not unknown.
 */

import type { IRCommand, IREntity, IRType } from '../../../ir.js';

export type WiringResultKind = 'declared' | 'allocation' | 'instance' | 'empty';

export interface WiringCommandResult {
  resultKind: WiringResultKind;
  returnTsType: string;
}

/** Maps a command to the success payload the Convex dispatcher actually returns. */
export class CommandResultShape {
  static from(input: {
    command: IRCommand;
    entity: IREntity | undefined;
    dispatchable: boolean;
    targetsExistingInstance: boolean;
    typeToTs: (type: IRType) => string;
  }): WiringCommandResult {
    if (input.command.returns) {
      return { resultKind: 'declared', returnTsType: input.typeToTs(input.command.returns) };
    }
    if (!input.dispatchable) {
      return { resultKind: 'empty', returnTsType: 'void' };
    }
    if (!input.targetsExistingInstance) {
      return { resultKind: 'allocation', returnTsType: '{ docId: string }' };
    }
    return {
      resultKind: 'instance',
      returnTsType: this.documentType(input.entity, input.typeToTs),
    };
  }

  private static documentType(
    entity: IREntity | undefined,
    typeToTs: (type: IRType) => string,
  ): string {
    const fields = (entity?.properties ?? []).map(
      (property) => `${property.name}: ${typeToTs(property.type)}`,
    );
    if (fields.length === 0) return 'Record<string, never>';
    return `{ ${fields.join('; ')} }`;
  }
}
