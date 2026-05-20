// Auto-generated canonical Manifest dispatcher.
// Generated from Manifest IR - DO NOT EDIT
// Canonical write path for governed commands. Per-command concrete routes
// (nextjs.command) are deprecated aliases that delegate here.
//
// This file is the verbatim shape produced by Manifest's `nextjs.dispatcher`
// projection. The fixture commits it so `manifest audit-governance` has
// something to inspect under route-drift and missing-tests detectors.

import type { NextRequest } from "next/server";
import { manifestErrorResponse, manifestSuccessResponse, normalizeCommandResult } from "@/lib/manifest-response";
import { createManifestRuntime } from "@/lib/manifest-runtime";

// Next.js 15 App Router: dynamic route params are async.
// See https://nextjs.org/docs/app/api-reference/file-conventions/route
interface DispatcherContext {
  params: Promise<{ entity: string; command: string }>;
}

export async function POST(request: NextRequest, ctx: DispatcherContext) {
  try {
    const userId = "stub-user"; // sample app: real auth lives in consumer

    const body = await request.json();
    const { entity, command } = await ctx.params;

    if (!entity || !command) {
      return manifestErrorResponse("Missing entity or command in route", 400);
    }

    const runtime = await createManifestRuntime({
      tenantId: "stub-tenant",
      orgId: "stub-tenant",
      actorId: userId,
      requestId: request.headers.get("x-request-id") ?? undefined,
      source: "route",
      user: { id: userId, tenantId: "stub-tenant" },
    });

    const result = await runtime.runCommand(command, body, {
      entityName: entity,
    });

    const normalized = normalizeCommandResult(entity, command, result);

    if (!normalized.success) {
      const firstDiagnostic = normalized.diagnostics?.[0];
      const status = firstDiagnostic?.kind === "policy_denial" ? 403
        : firstDiagnostic?.kind === "guard_failure" ? 422
        : firstDiagnostic?.kind === "constraint_block" ? 422
        : 400;
      return manifestErrorResponse({ error: normalized.error, diagnostics: normalized.diagnostics }, status);
    }

    return manifestSuccessResponse({ data: normalized.data, events: normalized.events, diagnostics: normalized.diagnostics });
  } catch (error) {
    console.error("Manifest dispatcher error:", error);
    return manifestErrorResponse("Internal server error", 500);
  }
}
