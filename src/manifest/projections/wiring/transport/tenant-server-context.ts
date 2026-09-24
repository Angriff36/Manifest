/**
 * Tenant column the Convex create mutation fills from auth.
 * Active only when the auth seam is set and the entity stores the declared
 * tenant column. Create always records that column from auth. Any other
 * command drops a same-named parameter only because the mutation does too.
 */

import type { IREntity, IRTenant, IRType } from '../../../ir.js';
import type { TrustedSourceKind, WiringParameterDescriptor } from '../types.js';

/** Marks the create-path tenant column as server-owned so a caller cannot supply it. */
export class TenantServerContext {
  static apply(
    params: WiringParameterDescriptor[],
    tenant: IRTenant | undefined,
    entity: IREntity | undefined,
    commandName: string,
    mutationOmitsTenant: boolean,
    authContextImport: string | undefined,
    typeToTs: (type: IRType) => string,
    kindFor: (source: string) => TrustedSourceKind,
  ): WiringParameterDescriptor[] {
    const injection = this.injection(tenant, entity, mutationOmitsTenant, authContextImport);
    if (!injection) return params;
    const serverOwned = this.descriptor(injection, typeToTs, kindFor(injection.source));
    const index = params.findIndex((parameter) => parameter.name === injection.name);
    if (index < 0) {
      if (commandName !== 'create') return params;
      return [...params, serverOwned];
    }
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
    mutationOmitsTenant: boolean,
    authContextImport: string | undefined,
  ): { name: string; source: string; type: IRType } | null {
    if (!mutationOmitsTenant) return null;
    if (!authContextImport) return null;
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
