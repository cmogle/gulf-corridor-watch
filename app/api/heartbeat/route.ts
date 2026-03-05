import { getInactivityMinutes, recordHeartbeat, kvStatus } from "@/lib/session-gate";

export const dynamic = "force-dynamic";

export async function POST() {
  const inactiveMinutes = await getInactivityMinutes();
  await recordHeartbeat();

  return Response.json({
    ok: true,
    inactive_minutes: inactiveMinutes,
    needs_catch_up: inactiveMinutes !== null && inactiveMinutes > 30,
    _debug_kv: kvStatus(),
  });
}
