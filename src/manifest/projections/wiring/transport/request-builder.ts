import { EpochMillisecondDate } from './date-wire.js';
import type {
  WiringCommandCall,
  WiringExecutableCommand,
  WiringHttpRequest,
} from './executable-command.js';
import type { WiringTransportProtocol } from '../types.js';
import { WiringTransportError } from './transport-error.js';

/** Builds one canonical dispatcher request from generated command facts. */
export class WiringCommandRequestBuilder {
  private readonly forbidden: Set<string>;
  private readonly dates = new EpochMillisecondDate();

  constructor(private readonly protocol: WiringTransportProtocol) {
    this.forbidden = new Set(protocol.forbiddenBodyKeys);
  }

  build(command: WiringExecutableCommand, call: WiringCommandCall): WiringHttpRequest {
    this.assertDispatchable(command);
    this.assertInstance(command, call);
    return {
      method: this.protocol.method,
      path: command.route,
      body: this.body(command, call),
    };
  }

  private assertDispatchable(command: WiringExecutableCommand): void {
    if (command.dispatchable) return;
    throw new WiringTransportError(
      'not_dispatchable',
      `${command.capabilityId} is not on the canonical command dispatcher`,
    );
  }

  private assertInstance(command: WiringExecutableCommand, call: WiringCommandCall): void {
    if (!command.targetsExistingInstance) return;
    if (typeof call.docId === 'string' && call.docId.length > 0) return;
    throw new WiringTransportError(
      'missing_instance_identity',
      `${command.capabilityId} requires ${this.protocol.instanceIdentityField}`,
    );
  }

  private body(command: WiringExecutableCommand, call: WiringCommandCall): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    this.copyClientFields(command, call, body);
    this.copyInstanceFields(command, call, body);
    return body;
  }

  private copyClientFields(
    command: WiringExecutableCommand,
    call: WiringCommandCall,
    body: Record<string, unknown>,
  ): void {
    const serverOwned = new Set(command.serverParameterNames);
    const dates = new Set(command.dateParameterNames);
    for (const name of command.clientParameterNames) {
      if (this.forbidden.has(name) || serverOwned.has(name)) continue;
      if (!Object.prototype.hasOwnProperty.call(call.client, name)) continue;
      const value = call.client[name];
      if (value === undefined) continue;
      body[name] = dates.has(name) ? this.dates.toWire(value) : value;
    }
  }

  private copyInstanceFields(
    command: WiringExecutableCommand,
    call: WiringCommandCall,
    body: Record<string, unknown>,
  ): void {
    if (command.targetsExistingInstance) {
      body[this.protocol.instanceIdentityField] = call.docId;
    }
    if (command.versionField && call.version !== undefined) {
      body[command.versionField] = call.version;
    }
    if (command.acceptsIdempotencyKey && call.idempotencyKey !== undefined) {
      body.idempotencyKey = call.idempotencyKey;
    }
  }
}
