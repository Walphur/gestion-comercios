/**
 * Comandos que en la PC resuelve Rust (src-tauri/src/commands.rs y vecinos),
 * con las mismas consultas, para la base del comercio en la web.
 */
import { getDb } from "../../../src/db/index";
import { withImmediateTransaction } from "../../../src/db/tx";
import { currentStorage } from "./context";

type Args = Record<string, unknown>;
type Handler = (args: Args) => Promise<unknown>;

const num = (v: unknown) => Number(v);
const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []);

export function readMeta(key: string): string | null {
  const row = currentStorage()
    .sql.exec<{ value: string }>("SELECT value FROM _walqo_meta WHERE key = ?", key)
    .toArray()[0];
  return row?.value ?? null;
}

export function writeMeta(key: string, value: string): void {
  currentStorage().sql.exec(
    "INSERT INTO _walqo_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
    key,
    value,
  );
}

async function insertAudit(
  userId: number,
  action: string,
  entityType: string | null,
  entityId: number | null,
  details: string | null,
) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO action_log (user_id, action, entity_type, entity_id, details) VALUES (?1,?2,?3,?4,?5)",
    [userId, action, entityType, entityId, details],
  );
}

async function deactivateProductIds(list: number[]): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (let i = 0; i < list.length; i += 400) {
    const chunk = list.slice(i, i + 400);
    const marks = chunk.map((_, j) => `?${j + 1}`).join(",");
    const res = await db.execute(
      `UPDATE products SET active = 0, updated_at = datetime('now','localtime')
       WHERE id IN (${marks}) AND active = 1`,
      chunk,
    );
    if (res.rowsAffected > 0) {
      await db.execute(`DELETE FROM products_fts WHERE rowid IN (${marks})`, chunk);
    }
    total += res.rowsAffected;
  }
  return total;
}

function webLicenseStatus() {
  return {
    active: true,
    plan: "pro",
    pro_enabled: true,
    max_devices: 3,
    machine_id: "web",
    key_mask: null,
    message: null,
    needs_activation: false,
    offline_grace_days_left: null,
    billing: "monthly",
    expires_at: null,
    days_until_expiry: null,
    is_trial: false,
    trial_days_left: null,
    trial_offer_pending: false,
    trial_length_days: 7,
    trial_promo: null,
    max_products: null,
    catalog_super: false,
  };
}

async function readSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM settings WHERE key = ?1",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function arcaConfig() {
  const cuit = (await readSetting("arca_cuit")) ?? "";
  const pv = Number.parseInt((await readSetting("arca_punto_venta")) ?? "", 10);
  const certCargado = (await readSetting("arca_cert_enc")) != null;
  const keyCargada = (await readSetting("arca_key_enc")) != null;
  return {
    cuit,
    punto_venta: Number.isFinite(pv) ? pv : 1,
    ambiente: (await readSetting("arca_ambiente")) ?? "homo",
    cert_cargado: certCargado,
    key_cargada: keyCargada,
    configurado: cuit.trim() !== "" && certCargado && keyCargada,
  };
}

/** Cobro con QR (Mercado Pago / Payway) todavía no se conecta desde la web. */
const QR_OFF = { enabled: false, configured: false, simulation: false };

export const NATIVE_COMMANDS: Record<string, Handler> = {
  async get_mp_config_status() {
    return { ...QR_OFF, oauth_connected: false, oauth_available: false, nickname: null };
  },
  async get_payway_config_status() {
    return { ...QR_OFF, sandbox: false };
  },

  async arca_obtener_configuracion() {
    return arcaConfig();
  },
  async arca_obtener_estado() {
    const cfg = await arcaConfig();
    const digits = cfg.cuit.replace(/\D/g, "");
    return {
      conectado: false,
      ambiente: cfg.ambiente,
      cuit: cfg.cuit,
      cuit_formateado:
        digits.length === 11 ? `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}` : cfg.cuit,
      punto_venta: cfg.punto_venta,
      token_valido: false,
      token_expira: null,
      cert_valido: false,
      cert_dias_restantes: null,
      ultimo_cae: null,
      ultima_comunicacion_label: "Facturación electrónica todavía no disponible en WalQo Web",
      simulacion: false,
    };
  },
  async fiscal_listar_documentos(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 100) || 100, 1), 500);
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT fd.sale_id, COALESCE(fd.voucher_type, '') AS voucher_type,
              COALESCE(fd.voucher_number, '') AS voucher_number, COALESCE(fd.cbte_tipo, 0) AS cbte_tipo,
              COALESCE(fd.cbte_nro, 0) AS cbte_nro, COALESCE(fd.cae, '') AS cae,
              COALESCE(fd.cae_expires_at, '') AS cae_expires_at, COALESCE(fd.resultado, '') AS resultado,
              fd.simulated, fd.created_at, s.total, c.name AS customer_name
       FROM fiscal_documents fd
       JOIN sales s ON s.id = fd.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
       ORDER BY fd.id DESC LIMIT ?1`,
      [limit],
    );
    return rows.map((r) => ({ ...r, simulated: Number(r.simulated) !== 0 }));
  },

  async license_get_status() {
    const stored = readMeta("license_status");
    return stored ? { ...webLicenseStatus(), ...JSON.parse(stored) } : webLicenseStatus();
  },
  async license_refresh() {
    return NATIVE_COMMANDS.license_get_status({});
  },
  async license_get_machine_id() {
    return "web";
  },

  async get_connection_status() {
    return { online: true, pending_count: 0, worker_active: true, mode_label: "WalQo Web" };
  },

  async verify_user_pin(args) {
    const username = String(args.username ?? "").trim().toLowerCase();
    const pin = String(args.pin ?? "").trim();
    if (!username || !pin) throw new Error("Usuario o PIN incorrecto");
    const db = await getDb();
    const rows = await db.select<
      { id: number; username: string; display_name: string; role: string; hide_stock: number }[]
    >(
      `SELECT id, username, display_name, role, COALESCE(hide_stock, 0) AS hide_stock FROM users
       WHERE lower(username) = ?1 AND pin = ?2 AND active = 1 AND COALESCE(is_cadete, 0) = 0`,
      [username, pin],
    );
    const user = rows[0];
    if (!user) throw new Error("Usuario o PIN incorrecto");
    return { ...user, hide_stock: user.hide_stock !== 0 };
  },

  async open_cash_session(args) {
    const db = await getDb();
    const open = await db.select<{ id: number }[]>(
      "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
    );
    if (open[0]) return open[0].id;
    const res = await db.execute("INSERT INTO cash_sessions (user_id, status) VALUES (?1, 'open')", [
      num(args.userId),
    ]);
    return res.lastInsertId;
  },

  async close_cash_session_blind(args) {
    const sessionId = num(args.sessionId);
    const declared = num(args.declaredCash);
    const userId = num(args.userId);
    return withImmediateTransaction(async () => {
      const db = await getDb();
      const [sales] = await db.select<{ total: number }[]>(
        `SELECT COALESCE(SUM(total), 0) AS total FROM sales
         WHERE cash_session_id = ?1 AND voided = 0 AND payment_method = 'efectivo'`,
        [sessionId],
      );
      const [moves] = await db.select<{ total: number }[]>(
        `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END), 0) AS total
         FROM cash_movements WHERE cash_session_id = ?1`,
        [sessionId],
      );
      const expected = Number(sales?.total ?? 0) + Number(moves?.total ?? 0);
      const diff = declared - expected;
      await db.execute(
        `UPDATE cash_sessions SET status = 'closed', closed_at = datetime('now','localtime'),
         expected_cash = ?2, declared_cash = ?3, cash_difference = ?4 WHERE id = ?1`,
        [sessionId, expected, declared, diff],
      );
      await insertAudit(
        userId,
        "cash_session_close_blind",
        "cash_session",
        sessionId,
        `declared=${declared}, expected_hidden_until_admin=true`,
      );
      return {
        session_id: sessionId,
        expected_cash: expected,
        declared_cash: declared,
        cash_difference: diff,
        backup_path: null,
        cloud_backup_path: null,
      };
    });
  },

  async log_audit_action(args) {
    await insertAudit(
      num(args.userId),
      String(args.action ?? ""),
      (args.entityType as string | null) ?? null,
      args.entityId == null ? null : num(args.entityId),
      (args.details as string | null) ?? null,
    );
    return null;
  },

  async deactivate_products_cmd(args) {
    return withImmediateTransaction(() => deactivateProductIds(ids(args.ids)));
  },

  async deactivate_all_products_cmd() {
    return withImmediateTransaction(async () => {
      const db = await getDb();
      const rows = await db.select<{ id: number }[]>("SELECT id FROM products WHERE active = 1");
      return deactivateProductIds(rows.map((r) => r.id));
    });
  },

  async sync_products_fts_cmd(args) {
    const db = await getDb();
    for (const id of ids(args.ids)) {
      await db.execute("DELETE FROM products_fts WHERE rowid = ?1", [id]);
      await db.execute(
        `INSERT INTO products_fts(rowid, name, barcode, sku)
         SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '')
         FROM products WHERE id = ?1 AND active = 1`,
        [id],
      );
    }
    return null;
  },

  async count_catalog_products_cmd() {
    const db = await getDb();
    const [row] = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM products WHERE active = 1 AND catalog_source = 'supermarket'",
    );
    return { supermarket: Number(row?.n ?? 0), legacy: 0 };
  },

  async count_recoverable_products_cmd() {
    const db = await getDb();
    const [row] = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM products
       WHERE active = 0 AND COALESCE(catalog_source, '') NOT IN ('demo', 'supermarket')`,
    );
    return { inactive_imports: Number(row?.n ?? 0) };
  },

  async remove_demo_catalog_cmd() {
    const db = await getDb();
    const res = await db.execute(
      `UPDATE products SET active = 0, updated_at = datetime('now','localtime')
       WHERE catalog_source = 'demo' AND active = 1`,
    );
    if (res.rowsAffected > 0) {
      await db.execute(
        `DELETE FROM products_fts WHERE rowid IN (
           SELECT id FROM products WHERE active = 0 AND catalog_source = 'demo')`,
      );
    }
    return res.rowsAffected;
  },
};
