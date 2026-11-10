/**
 * Comandos de Rust que en la web resuelve el navegador. El resto va al servidor
 * (workers/walqo-web/src/native.ts), que avisa si todavía no está disponible.
 */
type Handler = (args: Record<string, unknown>) => Promise<unknown>;

async function openInNewTab(args: Record<string, unknown>) {
  window.open(String(args.url ?? ""), "_blank", "noopener");
  return null;
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
  get_backup_root_path: value(""),
};
