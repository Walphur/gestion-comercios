import {
  lanSyncConflictCount,
  lanSyncGetStatus,
  lanSyncPendingCount,
} from "../../lib/lanSync";
import type { LanFreshnessMeta } from "./types";

export async function buildLanFreshnessMeta(): Promise<LanFreshnessMeta> {
  try {
    const [status, pendingEvents, conflictCount] = await Promise.all([
      lanSyncGetStatus(),
      lanSyncPendingCount().catch(() => 0),
      lanSyncConflictCount().catch(() => 0),
    ]);
    return {
      enabled: status.enabled,
      role: status.role,
      status: status.status,
      pendingEvents,
      lastSyncAt: status.last_sync_at,
      conflictCount,
    };
  } catch {
    return {
      enabled: false,
      role: "off",
      status: "disconnected",
      pendingEvents: 0,
      lastSyncAt: null,
      conflictCount: 0,
    };
  }
}
