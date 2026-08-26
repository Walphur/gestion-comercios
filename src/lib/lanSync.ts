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
  psk_configured: boolean;
  bootstrap_status: string;
  bootstrap_applied: number;
  bootstrap_planned: number;
  bootstrap_generation: number;
  outbox_pending: number;
  deferred_pending: number;
  conflicts_open: number;
  products_with_variants: number;
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

export function lanSyncPullCatchup(): Promise<string> {
  return invoke<string>("lan_sync_pull_catchup");
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

export function lanSyncDiscardAllConflicts(): Promise<string> {
  return invoke<string>("lan_sync_discard_all_conflicts");
}

export function lanSyncGetDeviceCode(): Promise<string> {
  return invoke<string>("lan_sync_get_device_code");
}

export interface BootstrapPreview {
  categories: number;
  suppliers: number;
  products: number;
  customers: number;
  products_with_variants: number;
}

export interface BootstrapUiState {
  status: string;
  generation: number;
  bootstrap_applied_total: number;
  bootstrap_planned_total: number;
  products_with_variants: number;
}

export function lanSyncBootstrapPreview(): Promise<BootstrapPreview> {
  return invoke<BootstrapPreview>("lan_sync_bootstrap_preview");
}

export function lanSyncBootstrapStatus(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_status");
}

export function lanSyncBootstrapExport(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_export");
}

export function lanSyncBootstrapImport(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_import");
}

export function lanSyncBootstrapContribute(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_contribute");
}

export function lanSyncBootstrapRunClient(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_run_client");
}

export function lanSyncBootstrapComplete(): Promise<BootstrapUiState> {
  return invoke<BootstrapUiState>("lan_sync_bootstrap_complete");
}

export function lanSyncDeferredCount(): Promise<number> {
  return invoke<number>("lan_sync_deferred_count");
}

export interface SnapshotRowCounts {
  categories: number;
  suppliers: number;
  brands: number;
  products: number;
  product_barcodes: number;
  product_variants: number;
  customers: number;
}

export interface SnapshotManifest {
  snapshot_id: string;
  schema_version: number;
  app_version: string;
  source_device: string;
  generated_at: string;
  lamport_at_export: number;
  generation: number;
  row_counts: SnapshotRowCounts;
  content_sha256: string;
  compressed_size: number;
  uncompressed_size: number;
  includes_stock_seed: boolean;
  includes_variants: boolean;
}

export interface SnapshotPreview {
  products: number;
  categories: number;
  customers: number;
  suppliers: number;
  brands: number;
  variants: number;
  estimated_uncompressed_bytes: number;
}

export interface SnapshotUiState {
  status: string;
  snapshot_id: string;
  applied_id: string;
  includes_stock_seed: boolean;
  download_offset: number;
  last_error: string;
  manifest: SnapshotManifest | null;
}

export interface SnapshotImportProgress {
  phase: string;
  done: number;
  total: number;
  message: string;
}

export function lanSyncSnapshotPreview(): Promise<SnapshotPreview> {
  return invoke<SnapshotPreview>("lan_sync_snapshot_preview");
}

export function lanSyncSnapshotStatus(): Promise<SnapshotUiState> {
  return invoke<SnapshotUiState>("lan_sync_snapshot_status");
}

export function lanSyncSnapshotGenerate(
  includesStockSeed = true,
): Promise<SnapshotManifest> {
  return invoke<SnapshotManifest>("lan_sync_snapshot_generate", {
    includesStockSeed,
  });
}

export function lanSyncSnapshotFetchManifest(): Promise<SnapshotManifest> {
  return invoke<SnapshotManifest>("lan_sync_snapshot_fetch_manifest");
}

export function lanSyncSnapshotImport(): Promise<SnapshotImportProgress> {
  return invoke<SnapshotImportProgress>("lan_sync_snapshot_import");
}

export function lanSyncSnapshotCancel(): Promise<SnapshotUiState> {
  return invoke<SnapshotUiState>("lan_sync_snapshot_cancel");
}

export function lanSyncClearCatalogOutbox(): Promise<number> {
  return invoke<number>("lan_sync_clear_catalog_outbox");
}

export function snapshotStatusLabel(status: string): string {
  switch (status) {
    case "generating":
      return "Preparando catálogo…";
    case "ready":
      return "Listo para que las cajas lo copien";
    case "downloading":
      return "Descargando…";
    case "validating":
      return "Comprobando archivo…";
    case "importing":
      return "Copiando productos…";
    case "fts":
      return "Finalizando…";
    case "complete":
      return "Listo";
    case "cancelled":
      return "Cancelado";
    case "failed":
      return "Falló";
    default:
      return "Sin compartir";
  }
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
