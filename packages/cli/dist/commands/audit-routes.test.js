import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditUsageError, auditRouteFileContent, extractCommandFromPath, extractEntitySegmentFromPath, hasCommandManifestBacking, isExempted, isInCommandsNamespace, loadCommandsManifest, loadExemptions, OWNERSHIP_RULE_CODES, } from "./audit-routes";
const OPTIONS = {
    tenantField: "tenantId",
    deletedField: "deletedAt",
    locationField: "locationId",
};
// ============================================================================
// Existing rules (retained, must not regress)
// ============================================================================
describe("audit-routes", () => {
    it("flags write routes that do not use runCommand", () => {
        const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
        const result = auditRouteFileContent(content, "app/api/items/create/route.ts", OPTIONS);
        expect(result.findings.some((f) => f.code === "WRITE_ROUTE_BYPASSES_RUNTIME")).toBe(true);
    });
    it("accepts write routes that use runCommand", () => {
        const content = `
export async function POST() {
  const runtime = createManifestRuntime({ user: { id: userId, tenantId } });
  return runtime.runCommand("create", {});
}
`;
        const result = auditRouteFileContent(content, "app/api/items/create/route.ts", OPTIONS);
        expect(result.findings.some((f) => f.code === "WRITE_ROUTE_BYPASSES_RUNTIME")).toBe(false);
    });
    it("flags direct read queries missing tenant and soft delete filters", () => {
        const content = `
export async function GET() {
  const items = await database.item.findMany({ where: { status: "active" } });
  return Response.json(items);
}
`;
        const result = auditRouteFileContent(content, "app/api/items/route.ts", OPTIONS);
        expect(result.findings.some((f) => f.code === "READ_MISSING_TENANT_SCOPE")).toBe(true);
        expect(result.findings.some((f) => f.code === "READ_MISSING_SOFT_DELETE_FILTER")).toBe(true);
    });
    it("flags location references without location filter", () => {
        const content = `
export async function GET(request: Request) {
  const locationId = new URL(request.url).searchParams.get("locationId");
  const items = await database.item.findMany({ where: { tenantId, deletedAt: null } });
  return Response.json({ locationId, items });
}
`;
        const result = auditRouteFileContent(content, "app/api/items/route.ts", OPTIONS);
        expect(result.findings.some((f) => f.code === "READ_LOCATION_REFERENCE_WITHOUT_FILTER")).toBe(true);
    });
    it("does not flag compliant direct read query", () => {
        const content = `
export async function GET() {
  const items = await database.item.findMany({
    where: { tenantId, deletedAt: null, locationId },
  });
  return Response.json(items);
}
`;
        const result = auditRouteFileContent(content, "app/api/items/route.ts", OPTIONS);
        expect(result.findings).toHaveLength(0);
    });
    // ========================================================================
    // Helper functions
    // ========================================================================
    describe("isInCommandsNamespace", () => {
        it("detects /commands/ in path", () => {
            expect(isInCommandsNamespace("app/api/kitchen/tasks/commands/create/route.ts")).toBe(true);
            expect(isInCommandsNamespace("apps/api/app/api/crm/clients/commands/update/route.ts")).toBe(true);
        });
        it("rejects paths without /commands/", () => {
            expect(isInCommandsNamespace("app/api/kitchen/tasks/route.ts")).toBe(false);
            expect(isInCommandsNamespace("app/api/timecards/route.ts")).toBe(false);
        });
        it("handles Windows-style backslash paths", () => {
            expect(isInCommandsNamespace("app\\api\\kitchen\\tasks\\commands\\create\\route.ts")).toBe(true);
        });
    });
    describe("extractCommandFromPath", () => {
        it("extracts command name from commands namespace path", () => {
            expect(extractCommandFromPath("app/api/kitchen/tasks/commands/create/route.ts")).toBe("create");
            expect(extractCommandFromPath("app/api/crm/clients/commands/archive/route.ts")).toBe("archive");
        });
        it("returns null for non-commands paths", () => {
            expect(extractCommandFromPath("app/api/kitchen/tasks/route.ts")).toBeNull();
        });
        it("handles Windows paths", () => {
            expect(extractCommandFromPath("app\\api\\kitchen\\tasks\\commands\\create\\route.ts")).toBe("create");
        });
    });
    describe("extractEntitySegmentFromPath", () => {
        it("extracts entity segment before /commands/", () => {
            expect(extractEntitySegmentFromPath("app/api/kitchen/tasks/commands/create/route.ts")).toBe("tasks");
            expect(extractEntitySegmentFromPath("app/api/crm/clients/commands/update/route.ts")).toBe("clients");
        });
        it("returns null for non-commands paths", () => {
            expect(extractEntitySegmentFromPath("app/api/kitchen/tasks/route.ts")).toBeNull();
        });
    });
    describe("isExempted", () => {
        const exemptions = [
            {
                path: "app/api/webhooks/clerk/route.ts",
                methods: ["POST"],
                reason: "Auth callback",
            },
            {
                path: "app/api/timecards/bulk/route.ts",
                methods: ["POST"],
                reason: "Legacy bulk",
            },
        ];
        it("returns true for exempted path + method", () => {
            expect(isExempted("/root/app/api/webhooks/clerk/route.ts", "POST", exemptions, "/root")).toBe(true);
        });
        it("returns false for exempted path but wrong method", () => {
            expect(isExempted("/root/app/api/webhooks/clerk/route.ts", "DELETE", exemptions, "/root")).toBe(false);
        });
        it("returns false for non-exempted path", () => {
            expect(isExempted("/root/app/api/accounting/route.ts", "POST", exemptions, "/root")).toBe(false);
        });
        it("is case-insensitive on path comparison", () => {
            expect(isExempted("/root/App/Api/Webhooks/Clerk/route.ts", "POST", exemptions, "/root")).toBe(true);
        });
        it("refuses to match files outside root via .. traversal", () => {
            expect(isExempted("/other/app/api/webhooks/clerk/route.ts", "POST", exemptions, "/root")).toBe(false);
        });
        it("refuses to match when relative path resolves to absolute", () => {
            // On Windows, path.relative across drives can produce an absolute path
            // e.g. path.relative('C:\\root', 'D:\\app\\api\\webhooks\\clerk\\route.ts') → 'D:\\app\\...'
            // We guard against this by also checking path.isAbsolute(relPath)
            expect(isExempted("D:\\app\\api\\webhooks\\clerk\\route.ts", "POST", exemptions, "C:\\root")).toBe(false);
        });
        it("handles Windows backslash paths against forward-slash exemptions", () => {
            // path.relative on Windows produces backslashes; exemptions use forward slashes
            // We test the normalized comparison by constructing a path that path.relative would produce
            expect(isExempted("/root/app/api/timecards/bulk/route.ts", "POST", exemptions, "/root")).toBe(true);
        });
    });
    describe("hasCommandManifestBacking", () => {
        const manifest = [
            {
                entity: "KitchenTask",
                command: "create",
                commandId: "KitchenTask.create",
            },
            {
                entity: "KitchenTask",
                command: "update",
                commandId: "KitchenTask.update",
            },
            {
                entity: "CrmClient",
                command: "archive",
                commandId: "CrmClient.archive",
            },
        ];
        it("returns true when command name matches", () => {
            expect(hasCommandManifestBacking("app/api/kitchen/tasks/commands/create/route.ts", manifest)).toBe(true);
        });
        it("returns false when command name has no match", () => {
            expect(hasCommandManifestBacking("app/api/kitchen/tasks/commands/foo/route.ts", manifest)).toBe(false);
        });
        it("matches by command name only — entity naming conventions differ between IR and filesystem", () => {
            // IR entity is "CrmClient", filesystem segment is "clients" — command name "archive" is the stable key
            expect(hasCommandManifestBacking("app/api/crm/clients/commands/archive/route.ts", manifest)).toBe(true);
        });
        it("is case-insensitive on command name", () => {
            expect(hasCommandManifestBacking("app/api/kitchen/tasks/commands/Create/route.ts", manifest)).toBe(true);
        });
        it("returns false for non-commands path", () => {
            expect(hasCommandManifestBacking("app/api/kitchen/tasks/route.ts", manifest)).toBe(false);
        });
        it("matches kebab-case filesystem paths against camelCase IR commands", () => {
            const multiWordManifest = [
                {
                    entity: "Station",
                    command: "assignTask",
                    commandId: "Station.assignTask",
                },
                {
                    entity: "TimeEntry",
                    command: "clockIn",
                    commandId: "TimeEntry.clockIn",
                },
                {
                    entity: "PrepList",
                    command: "createFromSeed",
                    commandId: "PrepList.createFromSeed",
                },
                {
                    entity: "PrepListItem",
                    command: "updatePrepNotes",
                    commandId: "PrepListItem.updatePrepNotes",
                },
            ];
            // Filesystem uses kebab-case, IR uses camelCase — must match
            expect(hasCommandManifestBacking("app/api/kitchen/stations/commands/assign-task/route.ts", multiWordManifest)).toBe(true);
            expect(hasCommandManifestBacking("app/api/timecards/entries/commands/clock-in/route.ts", multiWordManifest)).toBe(true);
            expect(hasCommandManifestBacking("app/api/kitchen/prep-lists/commands/create-from-seed/route.ts", multiWordManifest)).toBe(true);
            expect(hasCommandManifestBacking("app/api/kitchen/prep-list-items/commands/update-prep-notes/route.ts", multiWordManifest)).toBe(true);
            // camelCase filesystem paths should also still match
            expect(hasCommandManifestBacking("app/api/kitchen/stations/commands/assignTask/route.ts", multiWordManifest)).toBe(true);
            // Non-existent command should still fail
            expect(hasCommandManifestBacking("app/api/kitchen/stations/commands/nonexistent-task/route.ts", multiWordManifest)).toBe(false);
        });
    });
    // ========================================================================
    // Ownership enforcement rules (Plan § 3)
    // ========================================================================
    describe("ownership enforcement", () => {
        const commandsManifest = [
            {
                entity: "KitchenTask",
                command: "create",
                commandId: "KitchenTask.create",
            },
            {
                entity: "KitchenTask",
                command: "update",
                commandId: "KitchenTask.update",
            },
        ];
        const exemptions = [
            {
                path: "app/api/webhooks/clerk/route.ts",
                methods: ["POST"],
                reason: "Auth callback",
            },
        ];
        function makeOwnership(overrides) {
            return {
                commandsManifest,
                exemptions,
                root: "",
                enforceOwnership: true,
                manifestExplicitlyProvided: true,
                ...overrides,
            };
        }
        // ------------------------------------------------------------------
        // Test D — Orphan command route detection
        // ------------------------------------------------------------------
        describe("COMMAND_ROUTE_ORPHAN", () => {
            it("flags command route not in commands manifest", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("foo", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/foo/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_ORPHAN")).toBe(true);
            });
            it("does not flag command route that IS in commands manifest", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("create", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_ORPHAN")).toBe(false);
            });
            it("fires when manifest explicitly provided but empty", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("create", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership({
                    commandsManifest: [],
                    manifestExplicitlyProvided: true,
                }));
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_ORPHAN")).toBe(true);
                const orphan = result.findings.find((f) => f.code === "COMMAND_ROUTE_ORPHAN");
                expect(orphan.message).toContain("empty");
            });
            it("does not fire when manifest NOT explicitly provided and empty (auto-detect miss)", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("create", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership({
                    commandsManifest: [],
                    manifestExplicitlyProvided: false,
                }));
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_ORPHAN")).toBe(false);
            });
        });
        // ------------------------------------------------------------------
        // Test E — Write outside commands namespace
        // ------------------------------------------------------------------
        describe("WRITE_OUTSIDE_COMMANDS_NAMESPACE", () => {
            it("flags write route outside commands namespace with no exemption", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS, makeOwnership({ exemptions: [] }));
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(true);
            });
            it("does not flag write route inside commands namespace", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("create", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(false);
            });
            it("does not flag GET-only routes outside commands namespace", () => {
                const content = `
export async function GET() {
  return Response.json({ items: [] });
}
`;
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(false);
            });
            it("flags each write method individually", () => {
                const content = `
export async function PUT() {
  return Response.json({ ok: true });
}
export async function DELETE() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/items/route.ts", OPTIONS, makeOwnership({ exemptions: [] }));
                const violations = result.findings.filter((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE");
                expect(violations).toHaveLength(2);
                expect(violations[0].message).toContain("PUT");
                expect(violations[1].message).toContain("DELETE");
            });
        });
        // ------------------------------------------------------------------
        // Test F — Exemption suppresses violation
        // ------------------------------------------------------------------
        describe("exemption suppression", () => {
            it("exemption suppresses WRITE_OUTSIDE_COMMANDS_NAMESPACE", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/webhooks/clerk/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(false);
            });
            it("exemption does not suppress other rules", () => {
                // The exempted route still gets WRITE_ROUTE_BYPASSES_RUNTIME
                // because it doesn't call runCommand — exemptions only affect
                // WRITE_OUTSIDE_COMMANDS_NAMESPACE
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/webhooks/clerk/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "WRITE_ROUTE_BYPASSES_RUNTIME")).toBe(true);
            });
            it("exemption for wrong method does not suppress", () => {
                const content = `
export async function DELETE() {
  return Response.json({ ok: true });
}
`;
                // Exemption is for POST only
                const result = auditRouteFileContent(content, "app/api/webhooks/clerk/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(true);
            });
        });
        // ------------------------------------------------------------------
        // COMMAND_ROUTE_MISSING_RUNTIME_CALL
        // ------------------------------------------------------------------
        describe("COMMAND_ROUTE_MISSING_RUNTIME_CALL", () => {
            it("flags command-namespace route that does not call runCommand", () => {
                const content = `
export async function POST() {
  await database.task.create({ data: { name: "test" } });
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL")).toBe(true);
            });
            it("does not flag command-namespace route that calls runCommand", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("create", {});
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership());
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL")).toBe(false);
            });
            it("has no exemptions — always fires for commands namespace", () => {
                // Even if the file is in the exemptions list, COMMAND_ROUTE_MISSING_RUNTIME_CALL
                // still fires because commands namespace always goes through runtime
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership({
                    exemptions: [
                        {
                            path: "app/api/kitchen/tasks/commands/create/route.ts",
                            methods: ["POST"],
                            reason: "test",
                        },
                    ],
                }));
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL")).toBe(true);
            });
        });
        // ------------------------------------------------------------------
        // Rollout severity
        // ------------------------------------------------------------------
        describe("rollout severity", () => {
            it("ownership rules emit warnings when enforceOwnership is false", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS, makeOwnership({ enforceOwnership: false, exemptions: [] }));
                const violation = result.findings.find((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE");
                expect(violation).toBeDefined();
                expect(violation.severity).toBe("warning");
            });
            it("ownership rules emit errors when enforceOwnership is true", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS, makeOwnership({ enforceOwnership: true, exemptions: [] }));
                const violation = result.findings.find((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE");
                expect(violation).toBeDefined();
                expect(violation.severity).toBe("error");
            });
        });
        // ------------------------------------------------------------------
        // No ownership context = no ownership rules
        // ------------------------------------------------------------------
        describe("without ownership context", () => {
            it("does not emit ownership rules when no ownership context provided", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
`;
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS
                // No ownership context
                );
                expect(result.findings.some((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE")).toBe(false);
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL")).toBe(false);
                expect(result.findings.some((f) => f.code === "COMMAND_ROUTE_ORPHAN")).toBe(false);
                // But existing rules still fire
                expect(result.findings.some((f) => f.code === "WRITE_ROUTE_BYPASSES_RUNTIME")).toBe(true);
            });
        });
        // ------------------------------------------------------------------
        // T3 — Mixed method exemptions
        // ------------------------------------------------------------------
        describe("mixed method exemptions", () => {
            it("exempts POST but not DELETE when only POST is exempted", () => {
                const content = `
export async function POST() {
  return Response.json({ ok: true });
}
export async function DELETE() {
  return Response.json({ ok: true });
}
`;
                const mixedExemptions = [
                    {
                        path: "app/api/timecards/route.ts",
                        methods: ["POST"],
                        reason: "Legacy POST only",
                    },
                ];
                const result = auditRouteFileContent(content, "app/api/timecards/route.ts", OPTIONS, makeOwnership({ exemptions: mixedExemptions, root: "" }));
                const violations = result.findings.filter((f) => f.code === "WRITE_OUTSIDE_COMMANDS_NAMESPACE");
                // POST is exempted, DELETE is not
                expect(violations).toHaveLength(1);
                expect(violations[0].message).toContain("DELETE");
            });
        });
        // ------------------------------------------------------------------
        // T4 — All ownership rules respect rollout severity
        // ------------------------------------------------------------------
        describe("all ownership rules respect rollout severity", () => {
            it("COMMAND_ROUTE_ORPHAN respects enforceOwnership flag", () => {
                const content = `
export async function POST() {
  return runtime.runCommand("foo", {});
}
`;
                const warningResult = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/foo/route.ts", OPTIONS, makeOwnership({ enforceOwnership: false }));
                const orphanWarning = warningResult.findings.find((f) => f.code === "COMMAND_ROUTE_ORPHAN");
                expect(orphanWarning).toBeDefined();
                expect(orphanWarning.severity).toBe("warning");
                const errorResult = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/foo/route.ts", OPTIONS, makeOwnership({ enforceOwnership: true }));
                const orphanError = errorResult.findings.find((f) => f.code === "COMMAND_ROUTE_ORPHAN");
                expect(orphanError).toBeDefined();
                expect(orphanError.severity).toBe("error");
            });
            it("COMMAND_ROUTE_MISSING_RUNTIME_CALL respects enforceOwnership flag", () => {
                const content = `
export async function POST() {
  await database.task.create({ data: {} });
  return Response.json({ ok: true });
}
`;
                const warningResult = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership({ enforceOwnership: false }));
                const missingWarning = warningResult.findings.find((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL");
                expect(missingWarning).toBeDefined();
                expect(missingWarning.severity).toBe("warning");
                const errorResult = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/create/route.ts", OPTIONS, makeOwnership({ enforceOwnership: true }));
                const missingError = errorResult.findings.find((f) => f.code === "COMMAND_ROUTE_MISSING_RUNTIME_CALL");
                expect(missingError).toBeDefined();
                expect(missingError.severity).toBe("error");
            });
        });
    });
    // ========================================================================
    // T1 — loadCommandsManifest and loadExemptions
    // ========================================================================
    describe("loadCommandsManifest", () => {
        const testDir = join(tmpdir(), "manifest-audit-test-" + Date.now());
        // Create and clean up temp dir
        it("returns empty array for non-existent file (ENOENT)", async () => {
            const result = await loadCommandsManifest(join(testDir, "nonexistent.json"));
            expect(result).toEqual([]);
        });
        it("parses valid commands manifest", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "commands.json");
            await writeFile(filePath, JSON.stringify([
                { entity: "Task", command: "create", commandId: "Task.create" },
                { entity: "Task", command: "update", commandId: "Task.update" },
            ]));
            const result = await loadCommandsManifest(filePath);
            expect(result).toHaveLength(2);
            expect(result[0].entity).toBe("Task");
            expect(result[0].command).toBe("create");
            await rm(testDir, { recursive: true, force: true });
        });
        it("throws AuditUsageError on malformed JSON", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "bad.json");
            await writeFile(filePath, "{ not valid json");
            await expect(loadCommandsManifest(filePath)).rejects.toThrow("not valid JSON");
            await expect(loadCommandsManifest(filePath)).rejects.toThrow(AuditUsageError);
            await rm(testDir, { recursive: true, force: true });
        });
        it("throws AuditUsageError on non-array JSON", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "object.json");
            await writeFile(filePath, '{"not": "an array"}');
            await expect(loadCommandsManifest(filePath)).rejects.toThrow("must be an array");
            await expect(loadCommandsManifest(filePath)).rejects.toThrow(AuditUsageError);
            await rm(testDir, { recursive: true, force: true });
        });
        it("filters out entries with missing required fields", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "mixed.json");
            await writeFile(filePath, JSON.stringify([
                { entity: "Task", command: "create", commandId: "Task.create" },
                { entity: "Task" }, // missing command and commandId
                { command: "update" }, // missing entity and commandId
                "not an object",
                null,
            ]));
            const result = await loadCommandsManifest(filePath);
            expect(result).toHaveLength(1);
            expect(result[0].command).toBe("create");
            await rm(testDir, { recursive: true, force: true });
        });
    });
    describe("loadExemptions", () => {
        const testDir = join(tmpdir(), "manifest-exemptions-test-" + Date.now());
        it("returns empty array for non-existent file (ENOENT)", async () => {
            const result = await loadExemptions(join(testDir, "nonexistent.json"));
            expect(result).toEqual([]);
        });
        it("parses valid exemptions file", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "exemptions.json");
            await writeFile(filePath, JSON.stringify([
                {
                    path: "app/api/webhooks/route.ts",
                    methods: ["POST"],
                    reason: "Webhook",
                },
            ]));
            const result = await loadExemptions(filePath);
            expect(result).toHaveLength(1);
            expect(result[0].path).toBe("app/api/webhooks/route.ts");
            await rm(testDir, { recursive: true, force: true });
        });
        it("throws AuditUsageError on malformed JSON", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "bad.json");
            await writeFile(filePath, "not json at all");
            await expect(loadExemptions(filePath)).rejects.toThrow("not valid JSON");
            await expect(loadExemptions(filePath)).rejects.toThrow(AuditUsageError);
            await rm(testDir, { recursive: true, force: true });
        });
        it("throws AuditUsageError on non-array JSON", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "object.json");
            await writeFile(filePath, '{"path": "test"}');
            await expect(loadExemptions(filePath)).rejects.toThrow("must be an array");
            await expect(loadExemptions(filePath)).rejects.toThrow(AuditUsageError);
            await rm(testDir, { recursive: true, force: true });
        });
        it("filters out entries with missing required fields", async () => {
            await mkdir(testDir, { recursive: true });
            const filePath = join(testDir, "mixed.json");
            await writeFile(filePath, JSON.stringify([
                {
                    path: "app/api/webhooks/route.ts",
                    methods: ["POST"],
                    reason: "Valid",
                },
                { path: "missing-methods" }, // missing methods array
                { methods: ["POST"] }, // missing path
                42,
            ]));
            const result = await loadExemptions(filePath);
            expect(result).toHaveLength(1);
            expect(result[0].reason).toBe("Valid");
            await rm(testDir, { recursive: true, force: true });
        });
    });
    // ========================================================================
    // --strict gate semantics (Option B)
    // ========================================================================
    describe("--strict gate semantics", () => {
        it("OWNERSHIP_RULE_CODES contains exactly the three ownership rules", () => {
            expect(OWNERSHIP_RULE_CODES).toEqual(new Set([
                "WRITE_OUTSIDE_COMMANDS_NAMESPACE",
                "COMMAND_ROUTE_MISSING_RUNTIME_CALL",
                "COMMAND_ROUTE_ORPHAN",
            ]));
        });
        it("non-ownership errors do not belong to the strict gate", () => {
            expect(OWNERSHIP_RULE_CODES.has("WRITE_ROUTE_BYPASSES_RUNTIME")).toBe(false);
            expect(OWNERSHIP_RULE_CODES.has("READ_MISSING_SOFT_DELETE_FILTER")).toBe(false);
            expect(OWNERSHIP_RULE_CODES.has("READ_MISSING_TENANT_SCOPE")).toBe(false);
            expect(OWNERSHIP_RULE_CODES.has("READ_LOCATION_REFERENCE_WITHOUT_FILTER")).toBe(false);
        });
        it("strict mode: route with only WRITE_ROUTE_BYPASSES_RUNTIME produces no ownership errors", () => {
            // A manual write route that bypasses runtime but is NOT in commands namespace
            // and IS exempted from WRITE_OUTSIDE_COMMANDS_NAMESPACE.
            // Under --strict, this should NOT block the exit code.
            const content = `
export async function POST() {
  await database.item.create({ data: { name: "test" } });
  return Response.json({ ok: true });
}
`;
            const exemptions = [
                {
                    path: "app/api/legacy/items/route.ts",
                    methods: ["POST"],
                    reason: "Legacy route — migration pending",
                },
            ];
            const result = auditRouteFileContent(content, "app/api/legacy/items/route.ts", OPTIONS, {
                commandsManifest: [],
                exemptions,
                root: "",
                enforceOwnership: true,
                manifestExplicitlyProvided: false,
            });
            // Should have WRITE_ROUTE_BYPASSES_RUNTIME (non-ownership error)
            const bypassFindings = result.findings.filter((f) => f.code === "WRITE_ROUTE_BYPASSES_RUNTIME");
            expect(bypassFindings.length).toBeGreaterThan(0);
            // Should have NO ownership-rule findings
            const ownershipFindings = result.findings.filter((f) => OWNERSHIP_RULE_CODES.has(f.code));
            expect(ownershipFindings).toHaveLength(0);
        });
        it("strict mode: orphan command route produces ownership error that blocks gate", () => {
            const content = `
export async function POST() {
  return runtime.runCommand("foo", {});
}
`;
            const result = auditRouteFileContent(content, "app/api/kitchen/tasks/commands/foo/route.ts", OPTIONS, {
                commandsManifest: [
                    {
                        entity: "KitchenTask",
                        command: "create",
                        commandId: "KitchenTask.create",
                    },
                ],
                exemptions: [],
                root: "",
                enforceOwnership: true,
                manifestExplicitlyProvided: true,
            });
            // Should have COMMAND_ROUTE_ORPHAN at error severity
            const orphanFindings = result.findings.filter((f) => f.code === "COMMAND_ROUTE_ORPHAN");
            expect(orphanFindings).toHaveLength(1);
            expect(orphanFindings[0].severity).toBe("error");
            // This IS an ownership error — would block the strict gate
            const ownershipErrors = result.findings.filter((f) => OWNERSHIP_RULE_CODES.has(f.code) && f.severity === "error");
            expect(ownershipErrors.length).toBeGreaterThan(0);
        });
        it("strict mode: mixed findings — only ownership errors would block gate", () => {
            // A route outside commands namespace, not exempted, that also bypasses runtime.
            // Under --strict, WRITE_OUTSIDE_COMMANDS_NAMESPACE blocks the gate.
            // WRITE_ROUTE_BYPASSES_RUNTIME does NOT block the gate.
            const content = `
export async function POST() {
  await database.item.create({ data: { name: "test" } });
  return Response.json({ ok: true });
}
`;
            const result = auditRouteFileContent(content, "app/api/items/route.ts", OPTIONS, {
                commandsManifest: [],
                exemptions: [],
                root: "",
                enforceOwnership: true,
                manifestExplicitlyProvided: false,
            });
            const allErrors = result.findings.filter((f) => f.severity === "error");
            const ownershipErrors = allErrors.filter((f) => OWNERSHIP_RULE_CODES.has(f.code));
            const nonOwnershipErrors = allErrors.filter((f) => !OWNERSHIP_RULE_CODES.has(f.code));
            // Both types of errors exist
            expect(ownershipErrors.length).toBeGreaterThan(0);
            expect(nonOwnershipErrors.length).toBeGreaterThan(0);
            // Only ownership errors would block the strict gate
            expect(ownershipErrors[0].code).toBe("WRITE_OUTSIDE_COMMANDS_NAMESPACE");
            expect(nonOwnershipErrors[0].code).toBe("WRITE_ROUTE_BYPASSES_RUNTIME");
        });
    });
});
//# sourceMappingURL=audit-routes.test.js.map