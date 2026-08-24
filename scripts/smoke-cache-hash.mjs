#!/usr/bin/env node
/**
 * Hash / cache identity — evidencia unitaria (sin sessionStorage / sin Tauri).
 * No inventa PASS de UI.
 */
import { createHash } from "node:crypto";

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

function hash(obj) {
  return createHash("sha256").update(canonicalize(obj)).digest("hex");
}

const base = {
  computed_at: "2026-08-24T20:00:00.000Z",
  sales: { today: { total: 100 } },
  inventory: { low_stock_count: 1 },
  alerts_summary: { critical_count: 0 },
  freshness: { pendingEvents: 0, status: "connected", conflictCount: 0 },
};

const h0 = hash(base);
const same = hash({ ...base });
const sale = hash({ ...base, sales: { today: { total: 101 } } });
const stock = hash({ ...base, inventory: { low_stock_count: 2 } });
const alerts = hash({ ...base, alerts_summary: { critical_count: 1 } });
const pending = hash({
  ...base,
  freshness: { pendingEvents: 3, status: "connected", conflictCount: 0 },
});
const conflict = hash({
  ...base,
  freshness: { pendingEvents: 0, status: "connected", conflictCount: 2 },
});
const disconnected = hash({
  ...base,
  freshness: { pendingEvents: 0, status: "disconnected", conflictCount: 0 },
});

const checks = [
  ["same payload same hash", h0 === same],
  ["sale changes hash", h0 !== sale],
  ["stock changes hash", h0 !== stock],
  ["alerts change hash", h0 !== alerts],
  ["pendingEvents change hash", h0 !== pending],
  ["conflictCount change hash", h0 !== conflict],
  ["status change hash", h0 !== disconnected],
];

const failed = checks.filter(([, ok]) => !ok);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      hashes: { h0, sale, stock, alerts, pending, conflict, disconnected },
      checks: checks.map(([name, ok]) => ({ name, ok })),
      note: "sessionStorage / UI invalidation = UNTESTED (requiere Tauri)",
    },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
