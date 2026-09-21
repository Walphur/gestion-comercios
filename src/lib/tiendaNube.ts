import { invoke } from "@tauri-apps/api/core";

export interface TnConfigStatus {
  enabled: boolean;
  connected: boolean;
  oauth_available: boolean;
  sync_stock: boolean;
  store_id: string | null;
  store_name: string | null;
  last_import_at: string | null;
  last_order_sync_at: string | null;
  mapped_products: number;
  outbox_pending: number;
  install_url: string | null;
}

export interface TnConnectResult {
  store_id: string;
  store_name: string;
}

export interface TnImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  pages: number;
  products_seen: number;
  variants_seen: number;
  errors: string[];
}

export interface TnOrderSyncResult {
  orders_processed: number;
  stock_deducted: number;
  skipped: number;
  errors: string[];
}

export interface TnPushStockResult {
  pushed: number;
  failed: number;
  errors: string[];
}

export function getTnConfigStatus(): Promise<TnConfigStatus> {
  return invoke<TnConfigStatus>("get_tn_config_status");
}

export function connectTnOauth(): Promise<TnConnectResult> {
  return invoke<TnConnectResult>("connect_tn_oauth");
}

export function disconnectTn(): Promise<void> {
  return invoke<void>("disconnect_tn");
}

export function saveTnManualCredentials(
  storeId: string,
  accessToken: string,
): Promise<TnConnectResult> {
  return invoke<TnConnectResult>("save_tn_manual_credentials", {
    storeId,
    accessToken,
  });
}

export function setTnSyncStock(enabled: boolean): Promise<void> {
  return invoke<void>("set_tn_sync_stock", { enabled });
}

export function tnImportProducts(): Promise<TnImportResult> {
  return invoke<TnImportResult>("tn_import_products");
}

export function tnSyncOrders(): Promise<TnOrderSyncResult> {
  return invoke<TnOrderSyncResult>("tn_sync_orders");
}

export function tnFlushStock(): Promise<TnPushStockResult> {
  return invoke<TnPushStockResult>("tn_flush_stock");
}

/** Encola push de stock a TN (fire-and-forget). */
export function tnEnqueueStockPush(productId: number): void {
  void invoke("tn_enqueue_stock_push", { productId }).catch(() => {});
}
