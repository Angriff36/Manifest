/**
 * Approved-bypass route — referenced by bypasses.json.
 *
 * This is a deliberate non-dispatcher write path that the bypass registry
 * acknowledges. The presence of this file is what makes the bypass entry
 * non-stale; `manifest audit-bypasses` walks the registry and fails if any
 * referenced path does not exist.
 *
 * Real implementations of admin-only bulk operations live in downstream
 * applications. This stub exists purely to give the bypass entry a real
 * target file under fixtures/sample-app/.
 */

export async function POST(): Promise<Response> {
  // Intentionally empty — fixture-only.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
