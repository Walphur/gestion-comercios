import { invoke } from "@tauri-apps/api/core";

export interface SyncStatusDto {
  online: boolean;
  pending_count: number;
  worker_active: boolean;
  mode_label: string;
}

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: "admin" | "manager" | "cashier";
}

export interface BlindCloseResult {
  session_id: number;
  expected_cash: number;
  declared_cash: number;
  cash_difference: number;
  backup_path: string | null;
}

export function getConnectionStatus(): Promise<SyncStatusDto> {
  return invoke<SyncStatusDto>("get_connection_status");
}

export function queueFiscalInvoice(saleId: number): Promise<void> {
  return invoke("queue_fiscal_invoice", { saleId });
}

export function runBackupNow(customPath?: string): Promise<string> {
  return invoke<string>("run_backup_now", { customPath: customPath ?? null });
}

export function logAuditAction(
  userId: number,
  action: string,
  entityType?: string,
  entityId?: number,
  details?: string,
): Promise<void> {
  return invoke("log_audit_action", {
    userId,
    action,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    details: details ?? null,
  });
}

export function openCashSession(userId: number): Promise<number> {
  return invoke<number>("open_cash_session", { userId });
}

export function closeCashSessionBlind(
  sessionId: number,
  declaredCash: number,
  userId: number,
): Promise<BlindCloseResult> {
  return invoke<BlindCloseResult>("close_cash_session_blind", {
    sessionId,
    declaredCash,
    userId,
  });
}

export function verifyUserPin(username: string, pin: string): Promise<AuthUser> {
  return invoke<AuthUser>("verify_user_pin", { username, pin });
}

export interface ImportProductsResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export function pickProductsCsvFile(): Promise<string | null> {
  return invoke<string | null>("pick_products_csv_file");
}

export function importProductsFromCsv(
  filePath: string,
  updateExisting: boolean,
): Promise<ImportProductsResult> {
  return invoke<ImportProductsResult>("import_products_from_csv", {
    filePath,
    updateExisting,
  });
}
