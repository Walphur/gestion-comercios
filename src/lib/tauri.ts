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
  cloud_backup_path: string | null;
}

export interface BackupResult {
  local_path: string;
  cloud_path: string | null;
}

export function getConnectionStatus(): Promise<SyncStatusDto> {
  return invoke<SyncStatusDto>("get_connection_status");
}

export function queueFiscalInvoice(saleId: number): Promise<void> {
  return invoke("queue_fiscal_invoice", { saleId });
}

export function runBackupNow(customPath?: string): Promise<BackupResult> {
  return invoke<BackupResult>("run_backup_now", { customPath: customPath ?? null });
}

export function pickBackupFolder(): Promise<string | null> {
  return invoke<string | null>("pick_backup_folder");
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
  notes: string[];
}

export function pickProductsCsvFile(): Promise<string | null> {
  return invoke<string | null>("pick_products_import_file");
}

/** Alias: abre diálogo para Excel (.xlsx/.xls) o CSV. */
export function pickProductsImportFile(): Promise<string | null> {
  return pickProductsCsvFile();
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
  catalog_ready: boolean;
  bundled: boolean;
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

export function restoreDatabase(): Promise<string> {
  return invoke<string>("restore_database_cmd");
}

export interface CatalogProductCounts {
  supermarket: number;
  legacy: number;
}

export function countCatalogProducts(): Promise<CatalogProductCounts> {
  return invoke<CatalogProductCounts>("count_catalog_products_cmd");
}

export interface RecoverableProductCounts {
  inactive_imports: number;
}

export function countRecoverableProducts(): Promise<RecoverableProductCounts> {
  return invoke<RecoverableProductCounts>("count_recoverable_products_cmd");
}

export function reactivateImportProducts(): Promise<number> {
  return invoke<number>("reactivate_import_products_cmd");
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
  mode: "empty" | "demo" | "skip" | "full" | "categories",
  categories: string[],
): Promise<void> {
  return invoke("apply_catalog_setup_choice", { mode, categories });
}

export function removeDemoCatalogProducts(): Promise<number> {
  return invoke<number>("remove_demo_catalog_cmd");
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

export function pickExportSalesPath(): Promise<string | null> {
  return invoke<string | null>("pick_export_sales_path");
}

export function pickExportSalesDetailPath(): Promise<string | null> {
  return invoke<string | null>("pick_export_sales_detail_path");
}

export function exportSalesCsv(filePath: string, days: number): Promise<number> {
  return invoke<number>("export_sales_csv", { filePath, days });
}

export function exportSalesDetailCsv(filePath: string, days: number): Promise<number> {
  return invoke<number>("export_sales_detail_csv", { filePath, days });
}

export {
  getBusinessLogoUrl,
  pickAndSaveBusinessLogo,
  removeBusinessLogo,
} from "./brandingApi";
