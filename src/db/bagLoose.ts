import { getDb } from "./index";
import {
  canSellBag,
  previewLooseSale,
  productSellsLoose,
  roundBagLooseQty,
  type BagLooseMode,
} from "../lib/bagLoose";
import { tnEnqueueStockPush } from "../lib/tiendaNube";

export interface BagLooseProductRow {
  id: number;
  name: string;
  stock: number;
  open_bag_kg: number;
  bag_kg: number | null;
  loose_price_per_kg: number | null;
  sell_loose: number;
  track_stock: number | null;
  price: number;
}

async function loadBagLooseProduct(productId: number): Promise<BagLooseProductRow> {
  const db = await getDb();
  const rows = await db.select<BagLooseProductRow[]>(
    `SELECT id, name, stock, open_bag_kg, bag_kg, loose_price_per_kg, sell_loose,
            track_stock, price
       FROM products WHERE id = $1`,
    [productId],
  );
  if (!rows.length) throw new Error("Producto no encontrado.");
  return rows[0];
}

/**
 * Descuenta stock de una venta bolsa/suelto.
 * Bolsa: −qty bolsas cerradas.
 * Suelto: abre bolsas si hace falta y resta kg de la abierta.
 * Devuelve bags_opened (para guardar en sale_items).
 */
export async function deductBagLooseForSale(
  productId: number,
  mode: BagLooseMode,
  qty: number,
  saleId: number,
  userId: number | null,
): Promise<{ bagsOpened: number }> {
  const p = await loadBagLooseProduct(productId);
  if (p.track_stock === 0) return { bagsOpened: 0 };
  if (!productSellsLoose(p)) {
    throw new Error(`«${p.name}» no está configurado para vender suelto.`);
  }

  const db = await getDb();
  const bagKg = Number(p.bag_kg);

  if (mode === "bag") {
    const bags = roundBagLooseQty(qty);
    if (!(bags > 0) || Math.abs(bags - Math.round(bags)) > 1e-9) {
      throw new Error("La cantidad de bolsas debe ser un número entero.");
    }
    const n = Math.round(bags);
    if (!canSellBag(p.stock, n)) {
      throw new Error(
        `Stock insuficiente de «${p.name}»: hay ${Math.floor(p.stock)} bolsa(s) cerrada(s).`,
      );
    }
    await db.execute("UPDATE products SET stock = stock - $1 WHERE id = $2", [n, productId]);
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1, 'sale', -$2, 'sale', $3, $4, $5)`,
      [productId, n, saleId, userId, crypto.randomUUID().replace(/-/g, "")],
    );
    tnEnqueueStockPush(productId);
    return { bagsOpened: 0 };
  }

  // Suelto
  const kg = roundBagLooseQty(qty);
  const preview = previewLooseSale(
    { closedBags: p.stock, openBagKg: p.open_bag_kg, bagKg },
    kg,
  );
  if (!preview.ok) {
    throw new Error(preview.error ?? `Stock insuficiente de «${p.name}».`);
  }

  await db.execute(
    `UPDATE products SET stock = $1, open_bag_kg = $2 WHERE id = $3`,
    [preview.closedAfter, preview.openKgAfter, productId],
  );

  if (preview.bagsToOpen > 0) {
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1, 'sale', -$2, 'sale', $3, $4, $5)`,
      [
        productId,
        preview.bagsToOpen,
        saleId,
        userId,
        crypto.randomUUID().replace(/-/g, ""),
      ],
    );
  }

  tnEnqueueStockPush(productId);
  return { bagsOpened: preview.bagsToOpen };
}

/** Invierte deductBagLooseForSale al anular. */
export async function restoreBagLooseForSale(
  productId: number,
  mode: BagLooseMode,
  qty: number,
  bagsOpened: number,
  saleId: number,
  userId: number | null,
): Promise<void> {
  const p = await loadBagLooseProduct(productId);
  if (p.track_stock === 0) return;

  const db = await getDb();
  const bagKg = Number(p.bag_kg) || 0;

  if (mode === "bag") {
    const n = Math.round(roundBagLooseQty(qty));
    if (n <= 0) return;
    await db.execute("UPDATE products SET stock = stock + $1 WHERE id = $2", [n, productId]);
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1, 'sale_void', $2, 'sale', $3, $4, $5)`,
      [productId, n, saleId, userId, crypto.randomUUID().replace(/-/g, "")],
    );
    tnEnqueueStockPush(productId);
    return;
  }

  const kg = roundBagLooseQty(qty);
  const opened = Math.max(0, Math.round(bagsOpened || 0));
  // open_after_void = open_now - opened*bag_kg + kg
  let open = roundBagLooseQty(Number(p.open_bag_kg) - opened * bagKg + kg);
  if (open < 0 && open > -1e-6) open = 0;
  if (open < -1e-6) {
    // Datos raros (edición manual): no dejar negativo; devolver a cerradas si alcanza.
    open = 0;
  }
  const closed = roundBagLooseQty(Number(p.stock) + opened);

  await db.execute(`UPDATE products SET stock = $1, open_bag_kg = $2 WHERE id = $3`, [
    closed,
    open,
    productId,
  ]);

  if (opened > 0) {
    await db.execute(
      `INSERT INTO stock_movements
         (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
       VALUES ($1, 'sale_void', $2, 'sale', $3, $4, $5)`,
      [
        productId,
        opened,
        saleId,
        userId,
        crypto.randomUUID().replace(/-/g, ""),
      ],
    );
  }
  tnEnqueueStockPush(productId);
}

export async function saveProductBagLoose(
  id: number,
  input: {
    sell_loose: boolean;
    loose_price_per_kg: number | null;
    bag_kg: number | null;
  },
): Promise<void> {
  const db = await getDb();
  if (!input.sell_loose) {
    await db.execute(
      `UPDATE products SET sell_loose = 0, loose_price_per_kg = NULL, bag_kg = NULL
       WHERE id = $1`,
      [id],
    );
    return;
  }
  const bagKg = Number(input.bag_kg);
  const loose = Number(input.loose_price_per_kg);
  if (!(bagKg > 0)) throw new Error("Indicá cuántos kilos tiene cada bolsa.");
  if (!(loose > 0)) throw new Error("Indicá el precio por kilo suelto.");
  await db.execute(
    `UPDATE products SET sell_loose = 1, loose_price_per_kg = $1, bag_kg = $2 WHERE id = $3`,
    [Math.round(loose * 100) / 100, roundBagLooseQty(bagKg), id],
  );
}
