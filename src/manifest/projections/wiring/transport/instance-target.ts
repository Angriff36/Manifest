/**
 * Whether a command targets an existing document.
 * Same allocation rule as the Convex dispatcher: create, createVia*, and the
 * selected initialization command allocate; every other entity command needs docId.
 */

import { selectInitializationCommand } from '../../../initialization-plan.js';
import type { IR, IRCommand } from '../../../ir.js';

export type CommandSuccessShape = 'empty' | 'created' | 'docId' | 'instance';

export interface CommandInstanceFacts {
  dispatchable: boolean;
  targetsExistingInstance: boolean;
  versionField: string | null;
  /**
   * What the dispatcher mutation actually returns.
   * created: Entity_create returns `{ _id, ...doc }`.
   * docId: the createVia export returns `{ docId }`.
   * instance: the instance runner returns the stored document.
   */
  successShape: CommandSuccessShape;
}

export class CommandInstanceTarget {
  private readonly allocatingKeys: Set<string>;
  private readonly versionByEntity: Map<string, string | undefined>;

  constructor(ir: IR) {
    this.allocatingKeys = CommandInstanceTarget.allocatingKeys(ir);
    this.versionByEntity = new Map(
      ir.entities.map((entity) => [entity.name, entity.versionProperty]),
    );
  }

  facts(command: IRCommand): CommandInstanceFacts {
    if (!command.entity) {
      return {
        dispatchable: false,
        targetsExistingInstance: false,
        versionField: null,
        successShape: 'empty',
      };
    }
    const allocates = this.allocates(command);
    const version = this.versionByEntity.get(command.entity);
    return {
      dispatchable: true,
      targetsExistingInstance: !allocates,
      versionField: !allocates && version ? version : null,
      successShape: this.successShape(command),
    };
  }

  /** Matches dispatcherMutationExport: create, the createVia entry, or the instance runner. */
  private successShape(command: IRCommand): CommandSuccessShape {
    if (command.name === 'create') return 'created';
    if (this.allocatingKeys.has(`${command.entity}.${command.name}`)) return 'docId';
    return 'instance';
  }

  private allocates(command: IRCommand): boolean {
    const key = `${command.entity}.${command.name}`;
    return (
      command.name === 'create' ||
      command.name.startsWith('createVia') ||
      this.allocatingKeys.has(key)
    );
  }

  private static allocatingKeys(ir: IR): Set<string> {
    const keys = new Set<string>();
    for (const entity of ir.entities) {
      const selected = selectInitializationCommand(ir, entity);
      if (selected && selected.name !== 'create') {
        keys.add(`${entity.name}.${selected.name}`);
      }
    }
    return keys;
  }
}
