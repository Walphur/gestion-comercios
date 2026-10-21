import { getDb } from "./index";
import { withRustDb } from "../lib/rustDb";
import { syncProductsFts } from "../lib/tauri";
import { withImmediateTransaction } from "./tx";
import { assertCanCreateProducts } from "../lib/planLimits";
import {
  insertSupplierPaymentTx,
  insertSupplierPurchaseTx,
  roundMoney,
  type SupplierPaymentMethod,
} from "./supplierAccounts";

export interface PurchaseEntryLine {
  productId?: number;
  barcode?: string;
  name: string;
  qty: number;
  unitCost: number;
  salePrice: number;
}

export interface PurchaseEntryOptions {
  userId: number | null;
  supplierNote?: string;
  /** Anota la compra en la cuenta del proveedor y, si se pagó, el pago. */
  supplier?: {
    id: number;
    payment: "a_cuenta" | SupplierPaymentMethod;
  };
  purchaseOrderId?: number;
}

export interface PurchaseEntryResult {
  created: number;
  updated: number;
  totalUnits: number;
}

export async function applyPurchaseEntry(
  lines: PurchaseEntryLine[],
  options: PurchaseEntryOptions,
): Promise<PurchaseEntryResult> {
  if (lines.length === 0) {
    throw new Error("Agregá al menos un producto.");
  }

  for (const line of lines) {
    if (!line.name.trim()) {
      throw new Error("Completá el nombre de todos los productos.");
    }
    if (line.qty <= 0) {
      throw new Error("La cantidad debe ser mayor a cero.");
    }
    if (line.unitCost < 0 || line.salePrice < 0) {
      throw new Error("Costo y precio no pueden ser negativos.");
    }
  }

  await assertCanCreateProducts(lines.filter((l) => !l.productId).length);

  const batchId = Date.now();
  const refNote = options.supplierNote?.trim() || "compra";
  const ftsIds: number[] = [];

  const result = await withImmediateTransaction(async () => {
    const db = await getDb();
    let created = 0;
    let updated = 0;
    let totalUnits = 0;

    for (const line of lines) {
      totalUnits += line.qty;

      if (line.productId) {
        await db.execute(
          `UPDATE products SET cost=$1, price=$2, stock=stock+$3,
           updated_at=datetime('now','localtime') WHERE id=$4`,
          [line.unitCost, line.salePrice, line.qty, line.productId],
        );
        await db.execute(
          `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
           VALUES ($1, 'purchase', $2, $3, $4, $5, $6)`,
          [
            line.productId,
            line.qty,
            refNote,
            batchId,
            options.userId,
            crypto.randomUUID().replace(/-/g, ""),
          ],
        );
        ftsIds.push(line.productId);
        updated += 1;
      } else {
        const barcode = line.barcode?.trim() || null;
        const res = await db.execute(
          `INSERT INTO products (sku, barcode, name, cost, price, stock, min_stock, unit, tax_rate, catalog_source)
           VALUES ($1,$2,$3,$4,$5,$6,0,'unidad',21,'purchase')`,
          [null, barcode, line.name.trim(), line.unitCost, line.salePrice, line.qty],
        );
        const pid = res.lastInsertId as number;
        if (barcode) {
          await db.execute(
            `INSERT OR IGNORE INTO product_barcodes (product_id, barcode, label, quantity_factor, is_primary)
             VALUES ($1,$2,'Principal',1,1)`,
            [pid, barcode],
          );
        }
        await db.execute(
          `INSERT INTO stock_movements (product_id, movement_type, qty, reference_type, reference_id, user_id, sync_id)
           VALUES ($1, 'purchase', $2, $3, $4, $5, $6)`,
          [pid, line.qty, refNote, batchId, options.userId, crypto.randomUUID().replace(/-/g, "")],
        );
        ftsIds.push(pid);
        created += 1;
      }
    }

    const supplier = options.supplier;
    if (supplier) {
      for (const pid of ftsIds) {
        await db.execute(
          "UPDATE products SET supplier_id = $1 WHERE id = $2 AND supplier_id IS NULL",
          [supplier.id, pid],
        );
      }
      const total = roundMoney(lines.reduce((a, l) => a + l.unitCost * l.qty, 0));
      if (total > 0) {
        const ref = {
          referenceType: "purchase_entry",
          referenceId: batchId,
          userId: options.userId,
        };
        await insertSupplierPurchaseTx(db, {
          ...ref,
          supplierId: supplier.id,
          amount: total,
          note: options.supplierNote?.trim() || "Compra con ingreso de mercadería",
        });
        if (supplier.payment !== "a_cuenta") {
          await insertSupplierPaymentTx(db, {
            ...ref,
            supplierId: supplier.id,
            amount: total,
            method: supplier.payment,
            note: "Pagada al recibir",
          });
        }
      }
    }

    if (options.purchaseOrderId) {
      await db.execute(
        `UPDATE purchase_orders SET status = 'received', closed_at = datetime('now','localtime')
         WHERE id = $1 AND status = 'pending'`,
        [options.purchaseOrderId],
      );
    }

    return { created, updated, totalUnits };
  });

  if (ftsIds.length > 0) {
    await withRustDb(() => syncProductsFts(ftsIds));
  }

  return result;
}
