import { getDb } from "../../../../src/db/index";
import { inspectCertificate, validateKeypair } from "./cms";
import { generatePedidoWebCrypto } from "./csr";
import {
  emitFiscalAdjustment,
  isConfigured,
  isSimulation,
  loadArcaConfig,
  queueAndEmit,
} from "./emit";
import { decryptSecret, encryptSecret } from "./secrets";
import { readSetting, writeSetting } from "./settings";
import { clearTicket, getAccessTicket, loadStoredTicket } from "./wsaa";
import { feDummy, feUltimo } from "./wsfe";

type Args = Record<string, unknown>;

const K_CUIT = "arca_cuit";
const K_PV = "arca_punto_venta";
const K_AMB = "arca_ambiente";
const K_CERT = "arca_cert_enc";
const K_KEY = "arca_key_enc";
const K_KEY_PENDING = "arca_key_pending_enc";
const K_SIM = "arca_simulation";

async function arcaConfigDto() {
  const cuit = (await readSetting(K_CUIT)) ?? "";
  const pv = Number.parseInt((await readSetting(K_PV)) ?? "", 10);
  const certCargado = (await readSetting(K_CERT)) != null;
  const keyCargada = (await readSetting(K_KEY)) != null;
  const pending = Boolean((await readSetting(K_KEY_PENDING))?.trim());
  return {
    cuit,
    punto_venta: Number.isFinite(pv) ? pv : 1,
    ambiente: (await readSetting(K_AMB)) ?? "homo",
    cert_cargado: certCargado,
    key_cargada: keyCargada,
    configurado: cuit.trim() !== "" && certCargado && keyCargada,
    pedido_pendiente: pending,
  };
}

function formatCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}

export const ARCA_COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  async arca_obtener_configuracion() {
    return arcaConfigDto();
  },

  async arca_obtener_estado() {
    const cfgDto = await arcaConfigDto();
    const sim = await isSimulation();
    let certValido = false;
    let certDias: number | null = null;
    let tokenValido = false;
    let tokenExpira: string | null = null;
    let ultimoCae: string | null = null;
    let label = "Sin configurar";

    if (cfgDto.configurado) {
      try {
        const cfg = await loadArcaConfig();
        const info = inspectCertificate(cfg.certPem);
        certValido = info.daysToExpiry >= 0;
        certDias = info.daysToExpiry;
        const ta = await loadStoredTicket();
        if (ta) {
          tokenValido = true;
          tokenExpira = ta.expirationTime;
        }
        const db = await getDb();
        const rows = await db.select<{ cae: string; voucher_number: string }[]>(
          `SELECT cae, voucher_number FROM fiscal_documents
           WHERE cae IS NOT NULL AND TRIM(cae) != '' ORDER BY id DESC LIMIT 1`,
        );
        if (rows[0]) ultimoCae = `${rows[0].voucher_number} · CAE ${rows[0].cae}`;
        label = sim
          ? "Simulación activa"
          : tokenValido
            ? "Listo para facturar"
            : "Configurado (pedí token con Probar conexión)";
      } catch (e) {
        label = String(e);
      }
    }

    return {
      conectado: cfgDto.configurado && certValido,
      ambiente: cfgDto.ambiente,
      cuit: cfgDto.cuit,
      cuit_formateado: formatCuit(cfgDto.cuit),
      punto_venta: cfgDto.punto_venta,
      token_valido: tokenValido,
      token_expira: tokenExpira,
      cert_valido: certValido,
      cert_dias_restantes: certDias,
      ultimo_cae: ultimoCae,
      ultima_comunicacion_label: label,
      simulacion: sim,
    };
  },

  async arca_guardar_configuracion(args) {
    const cuitDigits = String(args.cuit ?? "").replace(/\D/g, "");
    if (cuitDigits.length !== 11) throw new Error("El CUIT debe tener 11 dígitos.");
    const puntoVenta = Number(args.puntoVenta ?? args.punto_venta);
    if (!Number.isInteger(puntoVenta) || puntoVenta <= 0) {
      throw new Error("El punto de venta debe ser mayor a cero.");
    }
    const ambiente = String(args.ambiente ?? "homo") === "prod" ? "prod" : "homo";
    let certPem = args.certPem != null ? String(args.certPem) : null;
    let keyPem = args.keyPem != null ? String(args.keyPem) : null;

    if (!keyPem && certPem) {
      const pendingEnc = await readSetting(K_KEY_PENDING);
      if (pendingEnc?.trim()) {
        const pending = await decryptSecret(pendingEnc);
        try {
          validateKeypair(certPem, pending);
          keyPem = pending;
        } catch {
          /* no match */
        }
      }
    }

    let effectiveCert = certPem;
    let effectiveKey = keyPem;
    if (!effectiveCert) {
      const enc = await readSetting(K_CERT);
      if (enc) effectiveCert = await decryptSecret(enc);
    }
    if (!effectiveKey) {
      const enc = await readSetting(K_KEY);
      if (enc) effectiveKey = await decryptSecret(enc);
    }
    if (effectiveCert && effectiveKey) {
      validateKeypair(effectiveCert, effectiveKey);
      inspectCertificate(effectiveCert);
    }

    await writeSetting(K_CUIT, cuitDigits);
    await writeSetting(K_PV, String(puntoVenta));
    await writeSetting(K_AMB, ambiente);
    if (certPem) await writeSetting(K_CERT, await encryptSecret(certPem));
    if (keyPem) {
      await writeSetting(K_KEY, await encryptSecret(keyPem));
      await writeSetting(K_KEY_PENDING, "");
    }
    await clearTicket();
    return null;
  },

  async arca_generar_pedido_certificado(args) {
    const cuitDigits = String(args.cuit ?? "").replace(/\D/g, "");
    if (cuitDigits.length !== 11) throw new Error("Cargá el CUIT (11 números, sin guiones).");
    const nombre = String(args.nombre ?? "WalQo");
    const { csrPem, keyPem } = await generatePedidoWebCrypto(Number(cuitDigits), nombre, "walqo");
    await writeSetting(K_KEY_PENDING, await encryptSecret(keyPem));
    const archivo = `pedido-certificado-arca-${cuitDigits}.csr`;
    return { archivo, ruta: archivo, csr_pem: csrPem };
  },

  async arca_probar_conexion() {
    if (!(await isConfigured())) {
      return {
        ok: false,
        ambiente: null,
        servidores_ok: false,
        ta_expira: null,
        mensaje: "Completá CUIT, certificado y clave antes de probar.",
        detalle: null,
      };
    }
    const cfg = await loadArcaConfig();
    const sim = await isSimulation();
    try {
      const dummy = await feDummy(cfg, sim);
      const servidoresOk =
        dummy.app_server.toUpperCase().includes("OK") &&
        dummy.db_server.toUpperCase().includes("OK");
      let taExpira: string | null = null;
      if (!sim) {
        const ta = await getAccessTicket(cfg, true);
        taExpira = ta.expirationTime;
      } else {
        taExpira = new Date(Date.now() + 12 * 3600_000).toISOString();
      }
      return {
        ok: true,
        ambiente: cfg.ambiente,
        servidores_ok: servidoresOk || sim,
        ta_expira: taExpira,
        mensaje: sim ? "Simulación OK" : "Conexión OK con ARCA",
        detalle: `App=${dummy.app_server} DB=${dummy.db_server} Auth=${dummy.auth_server}`,
      };
    } catch (e) {
      return {
        ok: false,
        ambiente: cfg.ambiente,
        servidores_ok: false,
        ta_expira: null,
        mensaje: String(e),
        detalle: null,
      };
    }
  },

  async arca_validar_instalacion() {
    const pasos: { nombre: string; ok: boolean | null; detalle: string | null }[] = [];
    const push = (nombre: string, ok: boolean | null, detalle: string | null) => {
      pasos.push({ nombre, ok, detalle });
    };

    const cfgDto = await arcaConfigDto();
    push("CUIT y punto de venta", Boolean(cfgDto.cuit && cfgDto.punto_venta), null);
    push("Certificado cargado", cfgDto.cert_cargado, null);
    push("Clave privada cargada", cfgDto.key_cargada, null);

    if (!cfgDto.configurado) {
      return { ok: false, fallo_en: "Configuración incompleta", pasos };
    }

    try {
      const cfg = await loadArcaConfig();
      const info = inspectCertificate(cfg.certPem);
      push(
        "Certificado vigente",
        info.daysToExpiry >= 0,
        `${info.daysToExpiry} días · ${info.subject}`,
      );
      validateKeypair(cfg.certPem, cfg.keyPem);
      push("Par certificado/clave", true, null);
      const sim = await isSimulation();
      const dummy = await feDummy(cfg, sim);
      push("FEDummy", true, `${dummy.app_server}/${dummy.db_server}`);
      if (!sim) {
        const ta = await getAccessTicket(cfg);
        push("Ticket WSAA", true, `Expira ${ta.expirationTime}`);
      } else {
        push("Ticket WSAA", true, "Simulación");
      }
      return { ok: true, fallo_en: null, pasos };
    } catch (e) {
      push("Validación", false, String(e));
      return { ok: false, fallo_en: String(e), pasos };
    }
  },

  async arca_renovar_token() {
    const cfg = await loadArcaConfig();
    if (await isSimulation()) {
      return new Date(Date.now() + 12 * 3600_000).toISOString();
    }
    const ta = await getAccessTicket(cfg, true);
    return ta.expirationTime;
  },

  async arca_consultar_ultimo_comprobante(args) {
    const cfg = await loadArcaConfig();
    const sim = await isSimulation();
    const ticket = sim
      ? { token: "SIM", sign: "SIM", generationTime: "", expirationTime: "" }
      : await getAccessTicket(cfg);
    let cbteTipo = Number(args.cbteTipo ?? args.cbte_tipo);
    if (!Number.isFinite(cbteTipo) || cbteTipo <= 0) {
      const emisor = ((await readSetting("arca_emisor_iva")) ?? "monotributo").toLowerCase();
      cbteTipo = emisor === "ri" ? 6 : 11;
    }
    const nro = await feUltimo(cfg, ticket, cbteTipo, sim);
    return `${String(cfg.puntoVenta).padStart(4, "0")}-${String(nro).padStart(8, "0")}`;
  },

  async arca_set_simulacion(args) {
    const enabled = args.enabled === true || args.enabled === 1 || args.enabled === "1";
    await writeSetting(K_SIM, enabled ? "1" : "0");
    return null;
  },

  async queue_fiscal_invoice(args) {
    const saleId = Number(args.saleId ?? args.sale_id);
    if (!Number.isFinite(saleId)) throw new Error("saleId inválido");
    const raw = args.cbteTipo ?? args.cbte_tipo;
    const cbteTipo = raw == null ? null : Number(raw);
    await queueAndEmit(saleId, Number.isFinite(cbteTipo as number) ? (cbteTipo as number) : null);
    return null;
  },

  async fiscal_emitir_ajuste(args) {
    const parent = Number(args.parentSaleId ?? args.parent_sale_id);
    const kind = String(args.kind ?? "credit");
    const amount = args.amount == null ? null : Number(args.amount);
    if (!Number.isFinite(parent)) throw new Error("parentSaleId inválido");
    return emitFiscalAdjustment(parent, kind, Number.isFinite(amount as number) ? amount : null);
  },

  async fiscal_listar_documentos(args) {
    const limit = Math.min(Math.max(Number(args.limit ?? 100) || 100, 1), 500);
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT fd.sale_id, COALESCE(fd.voucher_type, '') AS voucher_type,
              COALESCE(fd.voucher_number, '') AS voucher_number, COALESCE(fd.cbte_tipo, 0) AS cbte_tipo,
              COALESCE(fd.cbte_nro, 0) AS cbte_nro, COALESCE(fd.cae, '') AS cae,
              COALESCE(fd.cae_expires_at, '') AS cae_expires_at, COALESCE(fd.resultado, '') AS resultado,
              fd.simulated, fd.created_at, s.total, c.name AS customer_name,
              fd.parent_sale_id, fd.adjustment_kind
       FROM fiscal_documents fd
       JOIN sales s ON s.id = fd.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
       ORDER BY fd.id DESC LIMIT ?1`,
      [limit],
    );
    return rows.map((r) => ({ ...r, simulated: Number(r.simulated) !== 0 }));
  },
};
