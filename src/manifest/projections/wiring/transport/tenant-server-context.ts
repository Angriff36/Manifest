/**
 * Tenant column the Convex mutations already fill from auth.
 * Added only when the program declares a tenant and the entity stores that column.
 */

import type { IREntity, IRTenant, IRType } from '../../../ir.js';
import type { TrustedSourceKind, WiringParameterDescriptor } from '../types.js';

/** Marks the real tenant column as server-owned so a caller cannot supply it. */
export class TenantServerContext {
  static apply(
    params: WiringParameterDescriptor[],
    tenant: IRTenant | undefined,
    entity: IREntity | undefined,
    typeToTs: (type: IRType) => string,
    kindFor: (source: string) => TrustedSourceKind,
  ): WiringParameterDescriptor[] {
    const injection = this.injection(tenant, entity);
    if (!injection) return params;
    const serverOwned = this.descriptor(injection, typeToTs, kindFor(injection.source));
    const index = params.findIndex((parameter) => parameter.name === injection.name);
    if (index < 0) return [...params, serverOwned];
    return params.map((parameter, position) =>
      position === index
        ? {
            ...parameter,
            ownership: 'server',
            trustedSource: injection.source,
            trustedSourceKind: kindFor(injection.source),
            required: true,
          }
        : parameter,
    );
  }

  private static injection(
    tenant: IRTenant | undefined,
    entity: IREntity | undefined,
  ): { name: string; source: string; type: IRType } | null {
    if (!tenant || !entity) return null;
    if (!entity.properties.some((property) => property.name === tenant.property)) return null;
    return { name: tenant.property, source: tenant.contextPath, type: tenant.type };
  }

  private static descriptor(
    injection: { name: string; source: string; type: IRType },
    typeToTs: (type: IRType) => string,
    kind: TrustedSourceKind,
  ): WiringParameterDescriptor {
    return {
      name: injection.name,
      tsType: typeToTs(injection.type),
      irTypeName: injection.type.name,
      required: true,
      nullable: injection.type.nullable === true,
      ownership: 'server',
      trustedSource: injection.source,
      trustedSourceKind: kind,
      constraints: {},
      hasRuntimeGuards: false,
    };
  }
}
