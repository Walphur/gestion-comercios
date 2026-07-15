import { invoke } from "@tauri-apps/api/core";

export type LanRole = "off" | "server" | "client";
export type LanStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error";

export interface LanConnectionInfo {
  device_id: string;
  device_name: string;
  remote_addr: string;
  connected_at: string;
}

export interface LanUiStatus {
  enabled: boolean;
  role: string;
  status: string;
  device_id: string;
  device_name: string;
  local_ip: string | null;
  port: number;
  server_host: string;
  clients_connected: number;
  pending: number;
  last_sync_at: string | null;
  last_error: string | null;
  clients: LanConnectionInfo[];
}

export interface LanDiscoverResult {
  host: string;
  port: number;
  device_id: string;
  name: string;
}

export interface LanSyncLogRow {
  id: number;
  at: string;
  direction: string;
  peer: string | null;
  summary: string;
  detail: string | null;
}

export interface LanSyncConfigInput {
  role?: string;
  port?: number;
  psk?: string;
  device_name?: string;
  server_host?: string;
  device_code?: string;
}

export function lanSyncGetStatus(): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_get_status");
}

export function lanSyncSaveConfig(cfg: LanSyncConfigInput): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_save_config", { cfg });
}

export function lanSyncStartServer(): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_start_server");
}

export function lanSyncStopServer(): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_stop_server");
}

export function lanSyncConnect(): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_connect");
}

export function lanSyncDisconnect(): Promise<LanUiStatus> {
  return invoke<LanUiStatus>("lan_sync_disconnect");
}

export function lanSyncDiscover(timeoutSecs = 3): Promise<LanDiscoverResult[]> {
  return invoke<LanDiscoverResult[]>("lan_sync_discover", { timeoutSecs });
}

export function lanSyncTestConnection(): Promise<string> {
  return invoke<string>("lan_sync_test_connection");
}

export function lanSyncListLogs(limit = 100): Promise<LanSyncLogRow[]> {
  return invoke<LanSyncLogRow[]>("lan_sync_list_logs", { limit });
}

export function lanSyncPendingCount(): Promise<number> {
  return invoke<number>("lan_sync_pending_count");
}

export interface LanConflictRow {
  id: number;
  event_id: string;
  entity_type: string;
  entity_sync_id: string;
  op: string;
  payload: string | null;
  lamport: number;
  origin_device: string;
  created_at: string;
  reason: string;
  status: string;
}

export function lanSyncListConflicts(limit = 100): Promise<LanConflictRow[]> {
  return invoke<LanConflictRow[]>("lan_sync_list_conflicts", { limit });
}

export function lanSyncConflictCount(): Promise<number> {
  return invoke<number>("lan_sync_conflict_count");
}

export function lanSyncResolveConflict(
  conflictId: number,
  action: "retry" | "discard",
): Promise<string> {
  return invoke<string>("lan_sync_resolve_conflict", { conflictId, action });
}

export function lanSyncGetDeviceCode(): Promise<string> {
  return invoke<string>("lan_sync_get_device_code");
}

export function lanStatusLabel(status: string): string {
  switch (status) {
    case "connected":
      return "Conectado";
    case "connecting":
      return "Conectando…";
    case "syncing":
      return "Sincronizando";
    case "error":
      return "Error";
    default:
      return "Desconectado";
  }
}
