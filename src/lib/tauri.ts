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

/** Importa productos_supermercado.csv (~190k filas). categories = solo esas cat1. */
export function importSupermarketCatalog(
  updateExisting: boolean,
  categories?: string[],
  csvPath?: string | null,
): Promise<ImportProductsResult> {
  return invoke<ImportProductsResult>("import_supermarket_catalog", {
    updateExisting,
    categories: categories ?? null,
    csvPath: csvPath ?? null,
  });
}

export function pickSupermarketCsvFile(): Promise<string | null> {
  return invoke<string | null>("pick_supermarket_csv_file");
}

export interface CatalogWizardState {
  needed: boolean;
  csv_available: boolean;
}

export function getCatalogWizardState(): Promise<CatalogWizardState> {
  return invoke<CatalogWizardState>("get_catalog_wizard_state");
}

export interface SupermarketCategory {
  name: string;
  count: number;
}

export function listSupermarketCategories(
  csvPath?: string | null,
): Promise<SupermarketCategory[]> {
  return invoke<SupermarketCategory[]>("list_supermarket_categories_cmd", {
    csvPath: csvPath ?? null,
  });
}

export interface DatabaseHealth {
  ok: boolean;
  message: string;
}

export function checkDatabaseHealth(): Promise<DatabaseHealth> {
  return invoke<DatabaseHealth>("check_database_health_cmd");
}

export function repairDatabase(): Promise<string> {
  return invoke<string>("repair_database_cmd");
}

export interface AppStorageInfo {
  app_data_dir: string;
  database_path: string;
  catalog_csv_path: string;
  catalog_csv_ready: boolean;
  catalog_bundled: boolean;
  exe_dir: string;
}

export function getAppStorageInfo(): Promise<AppStorageInfo> {
  return invoke<AppStorageInfo>("get_app_storage_info_cmd");
}

export function applyCatalogSetupChoice(
  mode: "skip" | "full" | "categories",
  categories: string[],
): Promise<void> {
  return invoke("apply_catalog_setup_choice", { mode, categories });
}

export function removeSupermarketCatalog(includeLegacy: boolean): Promise<number> {
  return invoke<number>("remove_supermarket_catalog_cmd", { includeLegacy });
}

export function countSupermarketProducts(): Promise<number> {
  return invoke<number>("count_supermarket_products_cmd");
}

export interface CatalogImportStatus {
  importing: boolean;
  done: boolean;
  message: string;
}

export function getCatalogImportStatus(): Promise<CatalogImportStatus> {
  return invoke<CatalogImportStatus>("get_catalog_import_status");
}

export function pickExportProductsPath(): Promise<string | null> {
  return invoke<string | null>("pick_export_products_path");
}

export function exportProductsCsv(filePath: string): Promise<number> {
  return invoke<number>("export_products_csv", { filePath });
}

export {
  getBusinessLogoUrl,
  pickAndSaveBusinessLogo,
  removeBusinessLogo,
} from "./brandingApi";
