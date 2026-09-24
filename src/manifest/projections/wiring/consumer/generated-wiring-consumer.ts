/**
 * Calls generated commands and reads the way a screen would.
 * It does not build routes or decide which actions to hide on its own.
 */

import type { WiringCommandCall } from '../transport/executable-command.js';
import type { WiringCommandExecutor } from '../transport/command-executor.js';
import type { WiringCommandOutcome } from '../transport/response-reader.js';
import type {
  WiringActionPresentation,
  WiringCommandDescriptor,
  WiringContract,
  WiringReadDescriptor,
} from '../types.js';

export interface OfferedAction {
  capabilityId: string;
  presentation: WiringActionPresentation;
}

/** Uses one generated contract for commands, reads, staleness, and which actions to show. */
export class GeneratedWiringConsumer {
  constructor(
    private readonly contract: WiringContract,
    private readonly executor: WiringCommandExecutor,
  ) {}

  command(capabilityId: string): WiringCommandDescriptor {
    const found = this.contract.capabilities.find((item) => item.capabilityId === capabilityId);
    if (!found) throw new Error(`Unknown capability ${capabilityId}`);
    return found;
  }

  offeredActions(): OfferedAction[] {
    return this.contract.capabilities
      .filter((item) => item.dispatchable && item.presentation.exposure === 'human')
      .map((item) => ({ capabilityId: item.capabilityId, presentation: item.presentation }))
      .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  }

  read(readId: string): WiringReadDescriptor {
    const found = this.contract.reads.find((item) => item.readId === readId);
    if (!found) throw new Error(`Unknown read ${readId}`);
    return found;
  }

  staleReadIds(capabilityId: string): string[] {
    return this.command(capabilityId)
      .invalidation.map((target) => target.readId)
      .filter((readId): readId is string => typeof readId === 'string');
  }

  execute<TData = never>(
    capabilityId: string,
    call: WiringCommandCall,
  ): Promise<WiringCommandOutcome<TData>> {
    return this.executor.execute(this.command(capabilityId), call);
  }
}
