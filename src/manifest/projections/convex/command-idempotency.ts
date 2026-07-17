/**
 * Command-level idempotency for the Convex projection.
 *
 * Mirrors reference-runtime IdempotencyStore semantics at the Convex storage
 * boundary: when callers supply `idempotencyKey`, duplicate invocations return
 * the cached mutation result without re-running guards, writes, emits, or reactions.
 */

import type { NormalizedConvexOptions } from './options.js';

export const COMMAND_IDEMPOTENCY_ARG_LINE = '    idempotencyKey: v.optional(v.string())';

export function commandIdempotencyEnabled(options: NormalizedConvexOptions): boolean {
  return options.enableCommandIdempotency;
}

export function renderCommandIdempotencySchemaBlock(tableName: string): string {
  return (
    `  ${tableName}: defineTable({\n` +
    `    key: v.string(),\n` +
    `    command: v.string(),\n` +
    `    result: v.any(),\n` +
    `    createdAt: v.number(),\n` +
    `  })\n` +
    `    .index("by_key", ["key"])`
  );
}

export function renderCommandIdempotencyHelpers(tableName: string): string {
  return (
    `async function __getCommandIdempotency(ctx: MutationCtx, key: string): Promise<any | undefined> {\n` +
    `  const row = await ctx.db\n` +
    `    .query(${JSON.stringify(tableName)})\n` +
    `    .withIndex("by_key", (q) => q.eq("key", key))\n` +
    `    .first();\n` +
    `  return row?.result;\n` +
    `}\n\n` +
    `async function __setCommandIdempotency(\n` +
    `  ctx: MutationCtx,\n` +
    `  key: string,\n` +
    `  command: string,\n` +
    `  result: unknown,\n` +
    `): Promise<void> {\n` +
    `  const existing = await ctx.db\n` +
    `    .query(${JSON.stringify(tableName)})\n` +
    `    .withIndex("by_key", (q) => q.eq("key", key))\n` +
    `    .first();\n` +
    `  if (existing !== null) return;\n` +
    `  await ctx.db.insert(${JSON.stringify(tableName)}, {\n` +
    `    key,\n` +
    `    command,\n` +
    `    result,\n` +
    `    createdAt: Date.now(),\n` +
    `  });\n` +
    `}`
  );
}

export function appendCommandIdempotencyArg(
  argLines: string[],
  options: NormalizedConvexOptions,
): void {
  if (!commandIdempotencyEnabled(options)) return;
  if (argLines.some((line) => line.includes('idempotencyKey:'))) return;
  argLines.push(COMMAND_IDEMPOTENCY_ARG_LINE);
}

export function renderCommandIdempotencyPrologue(): string[] {
  return [
    '    if (args.idempotencyKey !== undefined) {',
    '      const __cached = await __getCommandIdempotency(ctx, args.idempotencyKey);',
    '      if (__cached !== undefined) return __cached;',
    '    }',
  ];
}

export function renderCommandIdempotencyEpilogue(exportName: string, resultExpr: string): string[] {
  return [
    `    const __result = ${resultExpr};`,
    '    if (args.idempotencyKey !== undefined) {',
    `      await __setCommandIdempotency(ctx, args.idempotencyKey, ${JSON.stringify(exportName)}, __result);`,
    '    }',
    '    return __result;',
  ];
}

export function renderCommandIdempotencyWrappedRunnerHandler(
  exportName: string,
  runnerName: string,
): string {
  return (
    `async (ctx, args) => {\n` +
    `${renderCommandIdempotencyPrologue().join('\n')}\n` +
    `    const __result = await ${runnerName}(ctx, args);\n` +
    `    if (args.idempotencyKey !== undefined) {\n` +
    `      await __setCommandIdempotency(ctx, args.idempotencyKey, ${JSON.stringify(exportName)}, __result);\n` +
    `    }\n` +
    `    return __result;\n` +
    `  }`
  );
}
