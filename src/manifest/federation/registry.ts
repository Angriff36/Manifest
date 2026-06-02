/**
 * Federation registry — central service discovery for cross-service Manifest runtimes.
 *
 * The registry tracks ServiceDescriptors, resolves service endpoints, and
 * optionally performs periodic health checks to keep the federation view fresh.
 *
 * The registry is deterministic: same descriptors in → same lookups out.
 * Health checks are the only non-deterministic path and are opt-in.
 *
 * @module federation/registry
 */

import type {
  ServiceDescriptor,
  ServiceHealth,
  FederationRegistryOptions,
  ExposedCommand,
} from './types';

/**
 * FederationRegistry: discovers and tracks remote Manifest services.
 *
 * Usage:
 *   const registry = new FederationRegistry({ healthCheckIntervalMs: 30000 });
 *   registry.register(ordersDescriptor);
 *   registry.register(inventoryDescriptor);
 *   const svc = registry.get('orders');
 *   const cmds = registry.findCommandsByEntity('orders', 'Order');
 */
export class FederationRegistry {
  private services: Map<string, ServiceDescriptor> = new Map();
  private options: Required<FederationRegistryOptions>;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: FederationRegistryOptions = {}) {
    this.options = {
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? 30000,
      healthCheckTimeoutMs: options.healthCheckTimeoutMs ?? 5000,
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
    };
    if (this.options.healthCheckIntervalMs > 0) {
      this.startHealthChecks();
    }
  }

  /**
   * Register a service descriptor. Replaces any existing descriptor
   * with the same serviceId.
   */
  register(descriptor: ServiceDescriptor): void {
    this.services.set(descriptor.serviceId, {
      ...descriptor,
      health: descriptor.health ?? { reachable: false, lastCheckedAt: 0 },
    });
  }

  /**
   * Register multiple service descriptors in a single call.
   */
  registerAll(descriptors: ServiceDescriptor[]): void {
    for (const d of descriptors) this.register(d);
  }

  /**
   * Remove a service from the registry.
   */
  unregister(serviceId: string): boolean {
    return this.services.delete(serviceId);
  }

  /**
   * Get a service descriptor by ID. Returns undefined if not registered.
   */
  get(serviceId: string): ServiceDescriptor | undefined {
    return this.services.get(serviceId);
  }

  /**
   * List all registered service descriptors.
   */
  list(): ServiceDescriptor[] {
    return Array.from(this.services.values());
  }

  /**
   * Find all commands exposed for a given entity across all services.
   * Returns an array of { serviceId, command } pairs.
   */
  findCommandsByEntity(entityName: string): Array<{ serviceId: string; command: ExposedCommandRef }> {
    const results: Array<{ serviceId: string; command: ExposedCommandRef }> = [];
    for (const svc of this.services.values()) {
      for (const entity of svc.entities) {
        if (entity.name === entityName) {
          for (const cmd of entity.commands) {
            results.push({ serviceId: svc.serviceId, command: { name: cmd.name, descriptor: cmd } });
          }
        }
      }
    }
    return results;
  }

  /**
   * Find the service and command descriptor for a specific (entity, command) pair.
   * Returns undefined if not found.
   */
  findCommand(entityName: string, commandName: string): { service: ServiceDescriptor; command: ExposedCommand } | undefined {
    for (const svc of this.services.values()) {
      for (const entity of svc.entities) {
        if (entity.name === entityName) {
          const cmd = entity.commands.find((c) => c.name === commandName);
          if (cmd) return { service: svc, command: cmd };
        }
      }
    }
    return undefined;
  }

  /**
   * Get the list of all reachable services.
   */
  getReachable(): ServiceDescriptor[] {
    return this.list().filter((s) => s.health?.reachable === true);
  }

  /**
   * Manually trigger a health check on a single service.
   * Returns the updated health status.
   */
  async checkHealth(serviceId: string): Promise<ServiceHealth | undefined> {
    const svc = this.services.get(serviceId);
    if (!svc) return undefined;
    const health = await this.probeHealth(svc.endpoint);
    svc.health = health;
    return health;
  }

  /**
   * Stop the health check timer. Call this on shutdown to prevent leaks.
   */
  stop(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  private startHealthChecks(): void {
    this.healthTimer = setInterval(() => {
      for (const svc of this.services.values()) {
        this.probeHealth(svc.endpoint)
          .then((health) => { svc.health = health; })
          .catch(() => { /* swallow — health will be marked unreachable */ });
      }
    }, this.options.healthCheckIntervalMs);
  }

  private async probeHealth(endpoint: string): Promise<ServiceHealth> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.healthCheckTimeoutMs);
    try {
      const res = await this.options.fetchImpl(`${endpoint}/__manifest/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        return { reachable: false, lastCheckedAt: Date.now(), error: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { version?: string };
      return { reachable: true, lastCheckedAt: Date.now(), version: body.version };
    } catch (err) {
      clearTimeout(timeout);
      return {
        reachable: false,
        lastCheckedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/**
 * Reference to an exposed command including the full descriptor.
 */
export interface ExposedCommandRef {
  name: string;
  descriptor: ExposedCommand;
}
