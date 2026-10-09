import { invoke } from "@tauri-apps/api/core";
import { getOpenCashSessionId } from "../db/cash";
import { getDb } from "../db";
import { recordSale } from "../db/sales";
import { roundMoney } from "./discount";

type PhoneSaleItem = {
  sync_id: string;
  variant_sync_id?: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type PhoneSale = {
  id: string;
  applied?: number;
  payment_method: string;
  subtotal: number;
  total: number;
  paid: number | null;
  change_due: number | null;
  items: PhoneSaleItem[];
};

let busy = false;
let started = false;

export function startPhoneSaleBridge() {
  if (started) return;
  started = true;
  const tick = () => {
    void drainPhoneSales();
  };
  tick();
  window.setInterval(tick, 12000);
}

async function drainPhoneSales() {
  if (busy) return;
  busy = true;
  try {
    const sales = await invoke<PhoneSale[]>("catalog_mobile_take_phone_sales");
    for (const sale of sales ?? []) {
      try {
        if (!sale.applied) {
          await applyPhoneSale(sale);
          await invoke("catalog_mobile_mark_phone_sale", { id: sale.id });
        }
        await invoke("catalog_mobile_finish_phone_sale", {
          id: sale.id,
          ok: true,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("turno de caja") || message.includes("caja")) continue;
        await invoke("catalog_mobile_finish_phone_sale", {
          id: sale.id,
          ok: false,
          error: message.slice(0, 180),
        });
      }
    }
  } catch {
    /* Fuera de la app de escritorio, o el celular todavía no está vinculado. */
  } finally {
    busy = false;
  }
}

async function applyPhoneSale(sale: PhoneSale) {
  const cashSessionId = await getOpenCashSessionId();
  if (cashSessionId == null) {
    throw new Error("Abrí el turno de caja antes de registrar una venta.");
  }
  const db = await getDb();
  const items = [];
  for (const line of sale.items ?? []) {
    let productId: number | null = null;
    let variantId: number | null = null;
    let trackStock = 1;
    let isKit = 0;
    if (line.variant_sync_id) {
      const rows = await db.select<{ id: number; product_id: number }[]>(
        "SELECT id, product_id FROM product_variants WHERE sync_id = $1 LIMIT 1",
        [line.variant_sync_id],
      );
      const variant = rows[0];
      if (!variant) throw new Error("Ese modelo todavía no está en la compu.");
      variantId = variant.id;
      productId = variant.product_id;
    } else {
      const rows = await db.select<
        { id: number; has_variants: number; track_stock: number | null; is_kit: number }[]
      >(
        "SELECT id, has_variants, track_stock, is_kit FROM products WHERE sync_id = $1 LIMIT 1",
        [line.sync_id],
      );
      const product = rows[0];
      if (!product) throw new Error("Ese producto todavía no está en la compu.");
      if (product.has_variants) throw new Error("Elegí el modelo en el celular.");
      productId = product.id;
      trackStock = product.track_stock ?? 1;
      isKit = product.is_kit ?? 0;
    }
    const qty = Number(line.qty) || 0;
    const unit = Number(line.unit_price) || 0;
    items.push({
      product_id: productId,
      variant_id: variantId,
      name: line.name || "Producto",
      qty,
      stock_qty: trackStock === 0 && !isKit ? 0 : qty,
      unit_price: unit,
      discount_pct: 0,
      line_total: roundMoney(Number(line.line_total) || qty * unit),
    });
  }
  await recordSale({
    subtotal: Number(sale.subtotal) || 0,
    discount_pct: 0,
    total: Number(sale.total) || 0,
    payment_method: sale.payment_method,
    paid: sale.paid,
    change_due: sale.change_due,
    cash_session_id: cashSessionId,
    items,
  });
}
