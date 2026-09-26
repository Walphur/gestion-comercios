import { useEffect, useState } from "react";
import { Modal, NumericInput, Button } from "./ui";
import { produceProduct } from "../db/stock";
import { getProductRecipe } from "../db/recipes";
import { ingredientsForProduction } from "../lib/recipeMath";
import { formatDbError } from "../lib/dbError";
import { useAuth } from "../context/AuthContext";
import type { Product } from "../types";

interface Props {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onDone: () => void;
}

export default function ProduceProductModal({ open, product, onClose, onDone }: Props) {
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<
    { name: string; unit: string; need: number; stock: number }[]
  >([]);

  useEffect(() => {
    if (!open || !product) return;
    setQty(1);
    setError("");
    void getProductRecipe(product.id).then((r) => {
      if (!r) {
        setPreview([]);
        return;
      }
      const needs = ingredientsForProduction(
        r.items.map((i) => ({ productId: i.ingredient_product_id, qtyPerYield: i.qty })),
        r.yield_qty,
        1,
      );
      setPreview(
        r.items.map((it) => {
          const n = needs.find((x) => x.productId === it.ingredient_product_id);
          return {
            name: it.name,
            unit: it.unit,
            need: n?.qty ?? it.qty,
            stock: it.stock,
          };
        }),
      );
    });
  }, [open, product]);

  async function handleProduce() {
    if (!product) return;
    setBusy(true);
    setError("");
    try {
      await produceProduct(product.id, qty, user?.id ?? null);
      onDone();
      onClose();
    } catch (e) {
      setError(formatDbError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={product ? `Producir: ${product.name}` : "Producir"}
      onClose={onClose}
    >
      <p className="mb-3 text-sm text-ink-muted">
        Descuenta insumos de la receta y suma stock del producto elaborado.
      </p>
      <NumericInput
        label="Cantidad a producir"
        value={qty}
        onChange={(v) => setQty(Math.max(0.001, v || 1))}
      />
      {preview.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-lg border border-[var(--color-panel-border)] p-3 text-sm">
          <li className="text-xs font-semibold uppercase text-ink-muted">Insumos por unidad</li>
          {preview.map((p) => {
            const total = p.need * qty;
            const ok = p.stock + 1e-9 >= total;
            return (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{p.name}</span>
                <span className={`shrink-0 tabular-nums ${ok ? "text-ink-muted" : "text-red-600"}`}>
                  {total.toFixed(3)} {p.unit} / hay {p.stock}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" disabled={busy || !product} onClick={() => void handleProduce()}>
          {busy ? "Produciendo…" : "Producir"}
        </Button>
      </div>
    </Modal>
  );
}
