import { fiscalObtenerDocumento } from "./tauri";
import { getDb } from "../db";
import { parseFiscalError } from "./fiscalErrorHelp";
import { showFlash, showNotice } from "./notice";

const POLL_MS = 700;
const MAX_WAIT_MS = 45_000;

type QueueStatus = "PENDING" | "PROCESSING" | "FAILED" | "COMPLETED" | string;

async function queueRowForSale(
  saleId: number,
): Promise<{ status: QueueStatus; last_error: string | null } | null> {
  const db = await getDb();
  const rows = await db.select<{ status: string; last_error: string | null }[]>(
    `SELECT status, last_error FROM sync_queue
     WHERE entity_type = 'fiscal_invoice' AND entity_id = $1
     ORDER BY id DESC LIMIT 1`,
    [saleId],
  );
  return rows[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Tras encolar la factura: espera el resultado y avisa en pantalla
 * (CAE ok, error de ARCA en español, o «sigue en camino»).
 * No bloquea el cobro: se llama con void.
 */
export async function followFiscalInvoice(saleId: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const doc = await fiscalObtenerDocumento(saleId).catch(() => null);
    if (doc?.cae) {
      const nro = doc.voucher_number || `${doc.cbte_nro}`;
      const sim = doc.simulated ? " (prueba, no es real)" : "";
      showFlash({
        message: `Factura ${nro} con CAE listo${sim}.`,
        variant: "success",
        durationMs: 7000,
      });
      return;
    }

    const row = await queueRowForSale(saleId).catch(() => null);
    if (row?.status === "FAILED") {
      const raw = row.last_error?.trim() || "ARCA rechazó el comprobante.";
      const info = parseFiscalError(raw);
      showNotice({
        title: info.title,
        message: `${info.summary}\n\nQué hacer: ${info.hint}`,
        variant: "error",
        confirmLabel: "Entendido",
      });
      return;
    }

    await sleep(POLL_MS);
  }

  showFlash({
    message: "La factura sigue enviándose. Revisá Facturación en unos segundos.",
    variant: "success",
    durationMs: 6000,
  });
}
