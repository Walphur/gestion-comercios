/**
 * Self-test: expansión de stock (kits + recetas on-demand) sin doble descuento de insumos.
 */
import {
  expandStockDeductions,
  ingredientsForProduction,
  recipeUnitCost,
  defaultsForGastroKind,
  type StockExpandNode,
} from "../src/lib/recipeMath.ts";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

function eq(a: { productId: number; qty: number }[], b: { productId: number; qty: number }[]) {
  const norm = (xs: typeof a) =>
    [...xs].sort((x, y) => x.productId - y.productId).map((x) => `${x.productId}:${x.qty.toFixed(4)}`);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

const nodes = new Map<number, StockExpandNode>([
  // Papa, Aceite
  [1, { id: 1, isKit: false, trackStock: true }],
  [2, { id: 2, isKit: false, trackStock: true }],
  // Papas fritas batch (stock propio)
  [
    10,
    {
      id: 10,
      isKit: false,
      trackStock: true,
      recipeItems: [
        { productId: 1, qty: 0.25 },
        { productId: 2, qty: 0.02 },
      ],
    },
  ],
  // Papas fritas on-demand
  [
    11,
    {
      id: 11,
      isKit: false,
      trackStock: false,
      recipeItems: [
        { productId: 1, qty: 0.25 },
        { productId: 2, qty: 0.02 },
      ],
    },
  ],
  // Milanesa batch
  [20, { id: 20, isKit: false, trackStock: true }],
  // Combo con papas batch
  [
    30,
    {
      id: 30,
      isKit: true,
      trackStock: false,
      kitItems: [
        { productId: 20, qty: 1 },
        { productId: 10, qty: 1 },
      ],
    },
  ],
  // Combo con papas on-demand
  [
    31,
    {
      id: 31,
      isKit: true,
      trackStock: false,
      kitItems: [
        { productId: 20, qty: 1 },
        { productId: 11, qty: 1 },
      ],
    },
  ],
  // Plato viejo sin receta
  [40, { id: 40, isKit: false, trackStock: false }],
]);

const resolve = (id: number) => nodes.get(id);

// 1) Venta combo con elaborado en stock → solo componentes, NO insumos
{
  const d = expandStockDeductions(30, 2, resolve);
  assert(
    eq(d, [
      { productId: 20, qty: 2 },
      { productId: 10, qty: 2 },
    ]),
    "combo + batch elaborated: deducts finished components only (no ingredients)",
  );
}

// 2) Venta combo con on-demand → milanesa + insumos de papas
{
  const d = expandStockDeductions(31, 1, resolve);
  assert(
    eq(d, [
      { productId: 20, qty: 1 },
      { productId: 1, qty: 0.25 },
      { productId: 2, qty: 0.02 },
    ]),
    "combo + on-demand: expands recipe ingredients once",
  );
}

// 3) Venta directa on-demand
{
  const d = expandStockDeductions(11, 4, resolve);
  assert(
    eq(d, [
      { productId: 1, qty: 1 },
      { productId: 2, qty: 0.08 },
    ]),
    "on-demand sale expands recipe × qty",
  );
}

// 4) Compat: track_stock=0 sin receta = no-op
{
  const d = expandStockDeductions(40, 3, resolve);
  assert(d.length === 0, "legacy no-stock dish without recipe is no-op");
}

// 5) Producción math
{
  const needs = ingredientsForProduction(
    [
      { productId: 1, qtyPerYield: 0.25 },
      { productId: 2, qtyPerYield: 0.02 },
    ],
    1,
    10,
  );
  assert(
    eq(needs, [
      { productId: 1, qty: 2.5 },
      { productId: 2, qty: 0.2 },
    ]),
    "produce 10 portions uses 2.5 kg + 0.2 L",
  );
}

// 6) Costo
{
  const c = recipeUnitCost(
    [
      { qtyPerYield: 0.25, unitCost: 800 },
      { qtyPerYield: 0.02, unitCost: 2000 },
    ],
    1,
  );
  assert(Math.abs(c - 240) < 1e-9, `recipe unit cost = 240 (got ${c})`);
}

// 7) Defaults
{
  const ing = defaultsForGastroKind("ingredient");
  assert(ing.show_on_menu === false && ing.track_stock === true, "ingredient defaults");
  const kit = defaultsForGastroKind("kit", true);
  assert(kit.is_kit && kit.is_daily_menu && kit.show_on_menu, "daily menu kit defaults");
}

// 8) Receta anidada: hamburguesa on_demand → medallón on_demand → carne
{
  nodes.set(12, {
    id: 12,
    isKit: false,
    trackStock: false,
    recipeItems: [{ productId: 1, qty: 0.12 }],
  });
  nodes.set(13, {
    id: 13,
    isKit: false,
    trackStock: false,
    recipeItems: [
      { productId: 12, qty: 1 },
      { productId: 2, qty: 0.01 },
    ],
  });
  const nested = expandStockDeductions(13, 2, resolve);
  assert(
    eq(nested, [
      { productId: 1, qty: 0.24 },
      { productId: 2, qty: 0.02 },
    ]),
    "nested on-demand recipe expands to base ingredients",
  );
  const withStock = expandStockDeductions(10, 3, resolve);
  assert(eq(withStock, [{ productId: 10, qty: 3 }]), "batch prepared used as line deducts its own stock");
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nrecipe/stock expansion self-tests PASS");

