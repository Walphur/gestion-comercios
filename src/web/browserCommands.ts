/**
 * Comandos de Rust que en la web resuelve el navegador. El resto va al servidor
 * (workers/walqo-web/src/native.ts), que avisa si todavía no está disponible.
 */
import { logoBlobToDataUrl } from "../lib/brandingApi";
import { prepareProductImport, type ImportRow } from "../lib/productImport";
import { printSaleReceipt, printTestReceipt, type SaleReceiptData } from "../lib/prints/saleReceipt";
import { webCall } from "./api";
import { downloadBackup } from "./backup";
import { downloadCsv, fileNameOf, pickFile, pickedFile, readFileText, safeCsvName } from "./files";
import { readSpreadsheet } from "./spreadsheet";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

const native = <T>(cmd: string, args: Args = {}) => webCall<T>("/v1/native", { cmd, args });

async function openInNewTab(args: Args) {
  window.open(String(args.url ?? ""), "_blank", "noopener");
  return null;
}

const SPREADSHEET_ACCEPT =
  ".xlsx,.xlsm,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/** Tandas como las de import_products.rs: cada una es una transacción en el servidor. */
const IMPORT_BATCH = 2000;

interface BatchResult {
  inserted: number;
  updated: number;
  skipped: number;
  notes: string[];
}

async function importProducts(args: Args) {
  const sheet = await readSpreadsheet(pickedFile(String(args.filePath ?? "")));
  const prepared = prepareProductImport(sheet, {
    marginPercent: args.marginPercent == null ? null : Number(args.marginPercent),
  });
  const result = { inserted: 0, updated: 0, skipped: prepared.skipped, errors: [] as string[], notes: prepared.notes };
  for (let i = 0; i === 0 || i < prepared.rows.length; i += IMPORT_BATCH) {
    const rows: ImportRow[] = prepared.rows.slice(i, i + IMPORT_BATCH);
    const batch = await native<BatchResult>("import_products_batch", {
      rows,
      updateExisting: args.updateExisting === true,
      first: i === 0,
    });
    result.inserted += batch.inserted;
    result.updated += batch.updated;
    result.skipped += batch.skipped;
    for (const note of batch.notes) if (!result.notes.includes(note)) result.notes.push(note);
  }
  if (prepared.marginNote) result.notes.push(prepared.marginNote);
  return result;
}

/** Descarga lo que en la PC se guarda en la ruta elegida. Devuelve la cantidad de filas. */
async function exportCsv(cmd: string, args: Args) {
  const csv = await native<{ contents: string; count: number }>(cmd, args);
  downloadCsv(fileNameOf(String(args.filePath ?? "export.csv")), csv.contents);
  return csv.count;
}

/** En la web el ticket sale por la impresión del navegador; el cajón lo abre el driver de la impresora. */
async function printReceipt(args: Args) {
  const { printer, receipt } = await native<{
    printer: { enabled: boolean; width: number };
    receipt: SaleReceiptData | null;
  }>("web_sale_receipt", { saleId: args.saleId });
  if (!printer.enabled || !receipt) {
    return { printed: false, drawer_opened: false, mode: "off", message: "Impresora desactivada." };
  }
  printSaleReceipt(receipt, printer.width);
  return { printed: true, drawer_opened: false, mode: "browser", message: "Ticket enviado a la impresora." };
}

async function testPrinter() {
  const printer = await native<{ enabled: boolean; width: number }>("web_printer_settings");
  if (!printer.enabled) throw new Error("Activá la impresora en Administración.");
  printTestReceipt(printer.width);
  return "Prueba enviada a la impresión del navegador.";
}

async function saveLogo(args: Args) {
  const dataUrl = await logoBlobToDataUrl(pickedFile(String(args.sourcePath ?? "")));
  if (!dataUrl) throw new Error("No se pudo leer la imagen del logo.");
  return native<string>("web_save_business_logo", { dataUrl });
}

const MP_CONNECT_WAIT_MS = 5 * 60_000;

/**
 * La autorización se abre en otra pestaña; Mercado Pago vuelve a walqo.pro/oauth/callback.html,
 * que la manda a /web/?mp_code=… (MercadoPagoReturn) y esa pestaña termina la conexión en el servidor.
 */
async function connectMercadoPago() {
  const tab = window.open("about:blank", "_blank");
  let url: string;
  try {
    ({ url } = await native<{ url: string }>("mp_oauth_start"));
  } catch (error) {
    tab?.close();
    throw error;
  }
  if (!tab) {
    // Ventanas emergentes bloqueadas: se autoriza en esta misma pestaña y se vuelve con ?mp_code.
    location.assign(url);
    return new Promise<never>(() => {});
  }
  tab.location.href = url;
  const deadline = Date.now() + MP_CONNECT_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const st = await native<{ oauth_connected: boolean; configured: boolean; nickname: string | null }>(
      "get_mp_config_status",
    );
    if (st.oauth_connected && st.configured) {
      return { user_id: "", nickname: st.nickname ?? "Mercado Pago", external_store_id: "", external_pos_id: "" };
    }
  }
  throw new Error("Tiempo agotado. Autorizá en la pestaña de Mercado Pago y volvé a intentar.");
}

/** En la web todos los aparatos usan la misma base: la red entre cajas no aplica. */
async function lanOff() {
  return {
    enabled: false,
    role: "off",
    status: "off",
    device_id: "web",
    device_name: "WalQo Web",
    local_ip: null,
    port: 0,
    server_host: "",
    clients_connected: 0,
    pending: 0,
    last_sync_at: null,
    last_error: null,
    clients: [],
    psk_configured: false,
    bootstrap_status: "idle",
    bootstrap_applied: 0,
    bootstrap_planned: 0,
    bootstrap_generation: 0,
    outbox_pending: 0,
    deferred_pending: 0,
    conflicts_open: 0,
    products_with_variants: 0,
  };
}

const value = (v: unknown) => async () => v;

/** Sin cuenta todavía: la bienvenida ofrece crearla (prueba Pro o gratis) o entrar. */
async function noAccountStatus() {
  return {
    active: false,
    plan: "none",
    pro_enabled: false,
    max_devices: 0,
    machine_id: "web",
    key_mask: null,
    message: null,
    needs_activation: true,
    offline_grace_days_left: null,
    billing: "none",
    expires_at: null,
    days_until_expiry: null,
    is_trial: false,
    trial_days_left: null,
    trial_offer_pending: true,
    max_products: null,
    catalog_super: false,
  };
}

/** Lo único que se consulta antes de entrar con la cuenta. */
export const PRE_SESSION_COMMANDS: Record<string, Handler> = {
  license_get_status: noAccountStatus,
  license_refresh: noAccountStatus,
  license_get_machine_id: value("web"),
};

export const BROWSER_COMMANDS: Record<string, Handler> = {
  open_whatsapp_link: openInNewTab,
  lan_sync_get_status: lanOff,
  lan_sync_pending_count: value(0),
  lan_sync_conflict_count: value(0),
  /** El catálogo de supermercado se importa desde archivos de la PC. */
  get_catalog_import_status: value({ importing: false, done: false, message: "" }),
  /** Pedidos y turnos del catálogo por wifi de la PC: en la web no hay servidor local. */
  catalog_mobile_take_phone_sales: value([]),
  catalog_mobile_take_bookings: value([]),
  catalog_mobile_take_booking_status_ops: value([]),
  open_https_link: openInNewTab,
  connect_mp_oauth: connectMercadoPago,
  /** La web se actualiza sola al recargar la página. */
  update_check: value({ update: null, pinned: false }),
  update_install: value(null),

  pick_export_products_path: value("productos_export.csv"),
  pick_export_sales_path: value("ventas_resumen.csv"),
  pick_export_sales_detail_path: value("ventas_detalle.csv"),
  pick_export_csv_path: async (args) => safeCsvName(String(args.fileName ?? "export.csv")),
  export_products_csv: (args) => exportCsv("web_export_products", args),
  export_sales_csv: (args) => exportCsv("web_export_sales", args),
  export_sales_detail_csv: (args) => exportCsv("web_export_sales_detail", args),
  write_csv_export: async (args) => {
    const name = fileNameOf(String(args.filePath ?? ""));
    if (!name.toLowerCase().endsWith(".csv")) throw new Error("El archivo tiene que terminar en .csv");
    downloadCsv(name, String(args.contents ?? ""));
    return null;
  },

  pick_products_import_file: () => pickFile(SPREADSHEET_ACCEPT),
  pick_products_csv_file: () => pickFile(SPREADSHEET_ACCEPT),
  read_text_file: async (args) => readFileText(pickedFile(String(args.path ?? ""))),
  import_products_from_csv: importProducts,
  /** El catálogo de supermercado viene en el instalador de la PC. */
  get_catalog_wizard_state: value({ needed: false, csv_available: false, catalog_ready: false, bundled: false }),
  get_app_storage_info_cmd: value({
    app_data_dir: "",
    database_path: "",
    catalog_csv_path: "",
    catalog_csv_ready: false,
    catalog_bundled: false,
    exe_dir: "",
  }),
  list_supermarket_categories_cmd: value([]),

  print_sale_receipt: printReceipt,
  test_printer_connection: testPrinter,

  pick_business_logo: () => pickFile(IMAGE_ACCEPT),
  save_business_logo: saveLogo,

  /** Los datos ya están en internet; la copia se descarga a esta computadora. */
  get_backup_root_path: value(""),
  pick_backup_folder: value(null),
  run_backup_now: async () => ({ local_path: `tus Descargas (${await downloadBackup()})`, cloud_path: null }),
};
