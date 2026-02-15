// Auto-generated Next.js command handler for Logger.reset
// Generated from Manifest IR - DO NOT EDIT
// Writes MUST flow through runtime to enforce guards, policies, and constraints

import type { NextRequest } from "next/server";
import { manifestErrorResponse, manifestSuccessResponse } from "@/lib/manifest-response";
import { createManifestRuntime } from "@/lib/manifest-runtime";
import { getTenantIdForOrg } from "@/app/lib/tenant";
import { auth } from "@repo/auth/server";

export async function POST(request: NextRequest) {
  try {
  const { orgId, userId } = await auth();
  if (!(userId && orgId)) {
    return manifestErrorResponse("Unauthorized", 401);
  }

  const tenantId = await getTenantIdForOrg(orgId);

  if (!tenantId) {
    return manifestErrorResponse("Tenant not found", 400);
  }

    const body = await request.json();

    const runtime = await createManifestRuntime({ user: { id: userId, tenantId: tenantId } });
    const result = await runtime.runCommand("reset", body, {
      entityName: "Logger",
    });

    if (!result.success) {
      if (result.policyDenial) {
        return manifestErrorResponse(`Access denied: ${result.policyDenial.policyName}`, 403);
      }
      if (result.guardFailure) {
        return manifestErrorResponse(`Guard ${result.guardFailure.index} failed: ${result.guardFailure.formatted}`, 422);
      }
      return manifestErrorResponse(result.error ?? "Command failed", 400);
    }

    return manifestSuccessResponse({ result: result.result, events: result.emittedEvents });
  } catch (error) {
    console.error("Error executing Logger.reset:", error);
    return manifestErrorResponse("Internal server error", 500);
  }
}
