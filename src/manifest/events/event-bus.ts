/**
 * Event Bus adapter — cross-instance realtime delivery.
 *
 * The runtime's in-process event stream (`onEvent`/`subscribe`) only reaches
 * listeners on the same engine instance. An `EventBus` bridges that stream
 * across instances: an engine publishes one message per committed command and
 * (when it calls `connectEventBus`) re-dispatches remote messages to its own
 * local listeners. Contract + semantics: docs/spec/adapters.md § "Event Bus"
 * and docs/spec/semantics.md § "Cross-instance delivery".
 *
 * The bus is deliberately dumb: `publish` fans a message out to EVERY subscribed
 * handler, including the publishing engine's own handler. Skipping self-echo is
 * the engine's job (it compares `originId`), so any process-external transport
 * (Redis pub/sub, etc.) can satisfy this contract without tracking origins.
 */

// Type-only import — erased at compile time, so no runtime cycle with
// runtime-engine (which imports the EventBus type from here).
import type { EmittedEvent } from '../runtime-engine';

/** One post-commit batch of events from one engine instance. */
export interface EventBusMessage {
  /** Publishing engine's instance id — subscribers use it to skip self-echo. */
  originId: string;
  events: EmittedEvent[];
}

export type EventBusHandler = (message: EventBusMessage) => void;

export interface EventBus {
  publish(message: EventBusMessage): Promise<void>;
  /** Resolves once the subscription is active; returns an async unsubscribe. */
  subscribe(handler: EventBusHandler): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/**
 * In-process, single-node EventBus: synchronous fan-out to every subscribed
 * handler. `subscribe` resolves immediately and `publish` delivers on the same
 * tick, so two engines sharing one instance exchange events deterministically
 * with no scheduling — ideal for tests and single-process deployments. For
 * cross-process fan-out use `RedisEventBus` (@angriff36/manifest/events/redis),
 * which implements the same contract.
 *
 * `publish` delivers to the origin's own handler too — the engine filters that
 * out via `originId`; the bus stays a pure fan-out.
 */
export class MemoryEventBus implements EventBus {
  private handlers = new Set<EventBusHandler>();
  private closed = false;

  async publish(message: EventBusMessage): Promise<void> {
    if (this.closed) throw new Error('MemoryEventBus: publish after close');
    // Snapshot so a handler that (un)subscribes during delivery does not
    // perturb this fan-out. Handler errors are swallowed so one bad subscriber
    // cannot break delivery to the others — matching the in-process listener
    // policy in runtime-engine.dispatchToListeners.
    for (const handler of [...this.handlers]) {
      try {
        handler(message);
      } catch {
        // Ignore errors in bus handlers.
      }
    }
  }

  async subscribe(handler: EventBusHandler): Promise<() => Promise<void>> {
    if (this.closed) throw new Error('MemoryEventBus: subscribe after close');
    this.handlers.add(handler);
    return async () => {
      this.handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handlers.clear();
  }
}
