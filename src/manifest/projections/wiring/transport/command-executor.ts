import type { WiringTransportProtocol } from '../types.js';
import { ConvexHttpWireProtocol } from './command-wire-protocol.js';
import type { WiringCommandCall, WiringExecutableCommand } from './executable-command.js';
import { WiringCommandRequestBuilder } from './request-builder.js';
import { WiringCommandResponseReader, type WiringCommandOutcome } from './response-reader.js';
import { WiringTransportError } from './transport-error.js';

export interface WiringCommandExecutorOptions {
  baseUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
  protocol?: WiringTransportProtocol;
}

/** Executes any generated command through the canonical dispatcher. */
export class WiringCommandExecutor {
  private readonly protocol: WiringTransportProtocol;
  private readonly fetchImpl: typeof fetch;
  private readonly builder: WiringCommandRequestBuilder;
  private readonly reader: WiringCommandResponseReader;

  constructor(private readonly options: WiringCommandExecutorOptions) {
    this.protocol = options.protocol ?? ConvexHttpWireProtocol.canonical().toContract();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.builder = new WiringCommandRequestBuilder(this.protocol);
    this.reader = new WiringCommandResponseReader(this.protocol);
  }

  async execute<TData = never>(
    command: WiringExecutableCommand,
    call: WiringCommandCall,
  ): Promise<WiringCommandOutcome<TData>> {
    const request = this.builder.build(command, call);
    const response = await this.fetchImpl(this.url(request.path), {
      method: request.method,
      headers: {
        'content-type': this.protocol.contentType,
        authorization: `Bearer ${this.options.bearerToken}`,
      },
      body: JSON.stringify(request.body),
    });
    return this.reader.read(
      response.status,
      await this.parse(response),
    ) as WiringCommandOutcome<TData>;
  }

  private url(path: string): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    return `${base}${path}`;
  }

  private async parse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new WiringTransportError('invalid_response', 'Command response was not JSON');
    }
  }
}
