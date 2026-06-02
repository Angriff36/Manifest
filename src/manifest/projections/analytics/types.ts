/**
 * Configuration options for the Analytics projection.
 *
 * Generates typed analytics event schemas for Segment, Amplitude, Mixpanel,
 * or Snowplow from IR command executions and entity state changes.
 */

/** Supported analytics providers */
export type AnalyticsProvider = 'segment' | 'amplitude' | 'mixpanel' | 'snowplow';

export interface AnalyticsProjectionOptions {
  /**
   * Target analytics provider. Determines the generated tracking call signature:
   *   - 'segment':   analytics.track(event, properties)
   *   - 'amplitude': analytics.track(event, properties)
   *   - 'mixpanel':  mixpanel.track(event, properties)
   *   - 'snowplow':  trackSelfDescribingEvent(schema, payload)
   *
   * Default: 'segment'
   */
  provider?: AnalyticsProvider;

  /**
   * Custom import path for the analytics client (default depends on provider).
   * Override when using a wrapper or re-exported module.
   */
  importPath?: string;

  /**
   * Whether to emit a header comment with generation metadata (default: true).
   */
  emitHeader?: boolean;

  /**
   * Whether to include entity properties in the tracking plan alongside
   * command parameters (default: true).
   * Set to false to emit only command-emitted events.
   */
  includeEntityProperties?: boolean;

  /**
   * Whether to generate a separate typed handler file per entity (default: true).
   * When false, all handlers are emitted in a single file.
   */
  emitPerEntityHandlers?: boolean;

  /**
   * Custom namespace prepended to event names (default: '').
   * Example: 'app' produces 'app Task Status Updated'.
   */
  eventNamespace?: string;
}
