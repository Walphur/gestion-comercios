/**
 * Self-test: matemática e idempotencia lógica de comisiones de mozos V1 (sin DB).
 */
import {
  clampCommissionPct,
  commissionFromBase,
  isTipSaleLine,
  merchandiseBaseFromSale,
  parseCommissionPctInput,
} from "../src/lib/waiterCommissionMath.ts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else console.log("ok:", msg);
}

console.log("\n=== waiter commission self-test ===\n");

assert(isTipSaleLine({ name: "Propina", product_id: null, line_total: 100 }), "tip line");
assert(!isTipSaleLine({ name: "Café", product_id: 1, line_total: 100 }), "product not tip");

const lines = [
  { name: "Café", product_id: 1, line_total: 1000 },
  { name: "Propina", product_id: null, line_total: 100 },
];
const noDisc = merchandiseBaseFromSale(lines, 0);
assert(noDisc.merchandiseBase === 1000, "base sin descuento = 1000");
assert(noDisc.tipAmount === 100, "tip informativo = 100");
assert(commissionFromBase(noDisc.merchandiseBase, 10) === 100, "10% de 1000 = 100");

const withDisc = merchandiseBaseFromSale(lines, 10);
assert(withDisc.merchandiseBase === 900, "base con 10% desc = 900");
assert(commissionFromBase(withDisc.merchandiseBase, 10) === 90, "comisión sobre neto");
assert(withDisc.tipAmount === 100, "propina no afecta base");

assert(clampCommissionPct(-5) === 0, "pct negativo → 0");
assert(clampCommissionPct(150) === 100, "pct >100 → 100");
assert(parseCommissionPctInput("abc") === null, "inválido → null");
assert(parseCommissionPctInput("0") === 0, "0 ok");
assert(parseCommissionPctInput("100") === 100, "100 ok");
assert(parseCommissionPctInput("100.1") === null, "100.1 inválido");

assert(commissionFromBase(1000, 0) === 0, "pct 0 → comisión 0");
assert(commissionFromBase(1000, 100) === 1000, "pct 100 → toda la base");

if (failed) {
  console.error(`\n${failed} fallos\n`);
  process.exit(1);
}
console.log("\n=== waiter commission OK ===\n");
