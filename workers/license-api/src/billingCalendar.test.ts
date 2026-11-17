/**
 * Casos de aceptación del motor de renovación.
 * Ejecutar: node --experimental-strip-types src/billingCalendar.test.ts
 * (desde workers/license-api)
 */
import {
  addCalendarMonths,
  artYmd,
  previewRenewal,
  resolveRenewalExpiry,
} from "./billingCalendar.ts";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

function assertYmd(iso: string, ymd: string, msg: string) {
  assert(artYmd(iso) === ymd, `${msg} (got ${artYmd(iso)}, want ${ymd})`);
}

// 1. Mes simple
assert(
  addCalendarMonths("2026-11-10", 1) === "2026-12-10",
  "1. 2026-11-10 + 1 mes → 2026-12-10",
);

// 2. Atraso: ancla en vencimiento previo, no en pago
{
  const r = resolveRenewalExpiry({
    previousExpires: "2026-11-10T23:59:59.999Z",
    periods: 1,
    unit: "month",
    paidAt: "2026-11-17T15:00:00.000Z",
  });
  assertYmd(r.new_expires_at, "2026-12-10", "2. atraso 10/11 +1m → 10/12");
}

// 3. Prematuro: suma desde vencimiento futuro
{
  const r = resolveRenewalExpiry({
    previousExpires: "2026-12-10T23:59:59.999Z",
    periods: 1,
    unit: "month",
    paidAt: "2026-11-17T15:00:00.000Z",
  });
  assertYmd(r.new_expires_at, "2027-01-10", "3. prematuro desde 10/12 → 10/01");
}

// 4. Fin de mes → febrero no bisiesto
assert(addCalendarMonths("2026-01-31", 1) === "2026-02-28", "4. 31 ene → 28 feb 2026");

// 5. Bisiesto
assert(addCalendarMonths("2024-01-31", 1) === "2024-02-29", "5. 31 ene → 29 feb 2024");

// 6. Sin deriva acumulativa: día ancla 31
{
  const first = resolveRenewalExpiry({
    previousExpires: endFake("2026-01-31"),
    periods: 1,
    unit: "month",
  });
  assertYmd(first.new_expires_at, "2026-02-28", "6a. 31 ene → 28 feb");
  assert(first.billing_anchor_day === 31, "6a. billing_anchor_day=31");
  const second = resolveRenewalExpiry({
    previousExpires: first.new_expires_at,
    periods: 1,
    unit: "month",
    billingAnchorDay: first.billing_anchor_day,
  });
  assertYmd(second.new_expires_at, "2026-03-31", "6b. 28 feb + ancla 31 → 31 mar");
}

// 7. Trimestral
{
  const r = resolveRenewalExpiry({
    previousExpires: endFake("2026-11-10"),
    periods: 1,
    unit: "quarter",
  });
  assertYmd(r.new_expires_at, "2027-02-10", "7. trimestral 10/11 → 10/02");
}

// 8. Anual
{
  const r = resolveRenewalExpiry({
    previousExpires: endFake("2026-11-10"),
    periods: 1,
    unit: "year",
  });
  assertYmd(r.new_expires_at, "2027-11-10", "8. anual 10/11 → 10/11+1y");
}

// 9. Sin vencimiento previo
{
  const r = resolveRenewalExpiry({
    previousExpires: null,
    periods: 1,
    unit: "month",
    paidAt: "2026-11-17T15:00:00.000Z",
  });
  assertYmd(r.new_expires_at, "2026-12-17", "9. sin prev → +1m desde pago");
}

// 10. Dos períodos mensuales
{
  const r = resolveRenewalExpiry({
    previousExpires: endFake("2026-11-10"),
    periods: 2,
    unit: "month",
  });
  assertYmd(r.new_expires_at, "2027-01-10", "10. 2 meses desde 10/11 → 10/01");
}

// Preview = resolve
{
  const a = resolveRenewalExpiry({
    previousExpires: endFake("2026-11-10"),
    periods: 1,
    unit: "month",
  });
  const b = previewRenewal({
    previousExpires: endFake("2026-11-10"),
    periods: 1,
    unit: "month",
  });
  assert(a.new_expires_at === b.new_expires_at, "preview === resolve");
}

function endFake(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)).toISOString();
}

if (failed) {
  console.error(`\n${failed} fallos`);
  process.exit(1);
}
console.log("\nTodos los casos de aceptación OK");
