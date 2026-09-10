import type { IR } from '../../ir';

/** Shared role semantics for queries, mutations, and standalone computed helpers. */
export function renderRoleHelper(ir: IR): string {
  const map: Record<string, { action: string; target?: string }[]> = {};
  for (const role of ir.roles ?? []) {
    map[role.name] = [...(role.effectivePermissions ?? [])]
      .map((permission) => ({
        action: permission.action,
        ...(permission.target === undefined ? {} : { target: permission.target }),
      }))
      .sort((a, b) =>
        `${a.action}\u0000${a.target ?? ''}`.localeCompare(`${b.action}\u0000${b.target ?? ''}`),
      );
  }
  return (
    `const ROLE_PERMISSIONS: Record<string, { action: string; target?: string }[]> = ${JSON.stringify(map, null, 2)};\n\n` +
    `function checkRole(userRole: unknown, action: unknown, target?: unknown): boolean {\n` +
    `  if (typeof userRole !== "string" || typeof action !== "string") return false;\n` +
    `  const perms = ROLE_PERMISSIONS[userRole];\n` +
    `  const requestedTarget = typeof target === "string" ? target : undefined;\n` +
    `  return perms ? perms.some((permission) =>\n` +
    `    (permission.action === action || permission.action === "all") &&\n` +
    `    (permission.target === undefined || permission.target === requestedTarget)\n` +
    `  ) : false;\n` +
    `}`
  );
}
