import type { IR } from '../../ir';

function rolePermissionsMap(ir: IR): string {
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
  return `const ROLE_PERMISSIONS: Record<string, { action: string; target?: string }[]> = ${JSON.stringify(map, null, 2)};\n\n`;
}

/**
 * Shared role semantics for queries, mutations, and standalone computed helpers.
 * With `gated`, checkRole also accepts the acting user's auth object and asks
 * the author's `roleGateDenies` (options.roleGateImport) first.
 */
export function renderRoleHelper(ir: IR, gated = false): string {
  if (!gated) {
    return (
      rolePermissionsMap(ir) +
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
  return (
    rolePermissionsMap(ir) +
    `// userOrRole: the acting user's auth object (gated by roleGateDenies) or a role name.\n` +
    `function checkRole(userOrRole: unknown, action: unknown, target?: unknown): boolean {\n` +
    `  let userRole: unknown = userOrRole;\n` +
    `  const requestedTarget = typeof target === "string" ? target : undefined;\n` +
    `  if (userOrRole !== null && typeof userOrRole === "object") {\n` +
    `    userRole = (userOrRole as { role?: unknown }).role;\n` +
    `    if (typeof action === "string" && roleGateDenies(userOrRole, action, requestedTarget)) return false;\n` +
    `  }\n` +
    `  if (typeof userRole !== "string" || typeof action !== "string") return false;\n` +
    `  const perms = ROLE_PERMISSIONS[userRole];\n` +
    `  return perms ? perms.some((permission) =>\n` +
    `    (permission.action === action || permission.action === "all") &&\n` +
    `    (permission.target === undefined || permission.target === requestedTarget)\n` +
    `  ) : false;\n` +
    `}`
  );
}

/**
 * With roleGateImport: `roleAllows(user.role, …)` hands the acting user's auth
 * object to checkRole so the gate sees it. Any other first argument is left
 * as a plain role-name check.
 */
export function applyRoleGate(body: string, roleGateImport: string | undefined): string {
  return roleGateImport ? body.split('checkRole(user.role,').join('checkRole(user,') : body;
}

export function roleGateImportLine(body: string, roleGateImport: string | undefined): string {
  return roleGateImport && /\bcheckRole\(/.test(body)
    ? `import { roleGateDenies } from ${JSON.stringify(roleGateImport)};\n`
    : '';
}
