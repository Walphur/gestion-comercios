import { DatabaseSync } from "node:sqlite";
import {
  appendUniqueLine,
  keepPreviousKm,
  planRepeatBooking,
} from "../src/lib/bookingMatch.ts";

const failures = [];

function check(name, condition) {
  if (!condition) failures.push(name);
  else console.log("ok", name);
}

const shopA = {
  customers: [{ id: 1, document: "30.123.456", phoneDigits: "1123456789" }],
  vehicles: [{ id: 10, customerId: 1, plate: "ab 123 cd" }],
};

const again = planRepeatBooking({
  document: "30123456",
  phoneDigits: "1123456789",
  plate: "AB123CD",
  ...shopA,
});
check("misma persona y misma patente se reutilizan", again.customer === "reuse" && again.customerId === 1 && again.vehicle === "reuse" && again.vehicleId === 10);

const second = planRepeatBooking({
  document: "30123456",
  phoneDigits: "1123456789",
  plate: "AA999BB",
  ...shopA,
});
check("misma persona y otra patente crea solo el vehículo", second.customer === "reuse" && second.vehicle === "create");

const other = planRepeatBooking({
  document: "27999888",
  phoneDigits: "1199998888",
  plate: "AB123CD",
  ...shopA,
});
check("patente de otro cliente no se reasigna ni se duplica", other.customer === "create" && other.vehicle === "conflict" && other.vehicleId === null);

const fresh = planRepeatBooking({
  document: "40111222",
  phoneDigits: "1144455566",
  plate: "AC111BD",
  customers: [],
  vehicles: [],
});
check("cliente y vehículo nuevos", fresh.customer === "create" && fresh.vehicle === "create");

const byPhone = planRepeatBooking({
  document: "",
  phoneDigits: "11 2345-6789",
  plate: "",
  customers: [{ id: 4, document: null, phoneDigits: "1123456789" }],
  vehicles: [],
});
check("sin dni reutiliza el teléfono normalizado", byPhone.customer === "reuse" && byPhone.customerId === 4 && byPhone.vehicle === "skip");

const clinic = planRepeatBooking({
  document: "30123456",
  phoneDigits: "1100000000",
  plate: "",
  customers: shopA.customers,
  vehicles: shopA.vehicles,
});
check("paciente existente se reutiliza y no pide vehículo", clinic.customer === "reuse" && clinic.customerId === 1 && clinic.vehicle === "skip");

const shopB = planRepeatBooking({
  document: "30123456",
  phoneDigits: "1100000000",
  plate: "AB123CD",
  customers: [],
  vehicles: [],
});
check("otro negocio con el mismo dni no ve la ficha del primero", shopB.customer === "create" && shopB.vehicle === "create");

check("el kilometraje nuevo conserva el anterior", keepPreviousKm(45000, 46000) === "Km anterior 45000");
check("el mismo kilometraje no agrega otra línea", keepPreviousKm(46000, 46000) === "");
check("no repite una observación ya guardada", appendUniqueLine("rayón", "rayón") === "rayón");

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE customers (id INTEGER PRIMARY KEY, document TEXT, phone TEXT);
  CREATE TABLE vehicles (id INTEGER PRIMARY KEY, customer_id INTEGER, plate TEXT, km INTEGER, notes TEXT);
  CREATE TABLE appointments (id INTEGER PRIMARY KEY, customer_id INTEGER, vehicle_id INTEGER);
`);

function rows(table) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

function applyBooking(document, phone, plate, km) {
  db.exec("BEGIN");
  try {
    const plan = planRepeatBooking({
      document,
      phoneDigits: phone,
      plate,
      customers: rows("customers").map((row) => ({
        id: row.id,
        document: row.document,
        phoneDigits: String(row.phone ?? "").replace(/\D/g, ""),
      })),
      vehicles: rows("vehicles").map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        plate: row.plate,
      })),
    });
    let customerId = plan.customerId;
    if (plan.customer === "create") {
      const inserted = db.prepare("INSERT INTO customers (document, phone) VALUES (?, ?)").run(document, phone);
      customerId = Number(inserted.lastInsertRowid);
    }
    let vehicleId = plan.vehicleId;
    if (plan.vehicle === "create") {
      const inserted = db.prepare("INSERT INTO vehicles (customer_id, plate, km, notes) VALUES (?, ?, ?, ?)").run(customerId, plate, km, "");
      vehicleId = Number(inserted.lastInsertRowid);
    } else if (plan.vehicle === "reuse" && vehicleId) {
      const current = db.prepare("SELECT km, notes FROM vehicles WHERE id = ?").get(vehicleId);
      const previous = keepPreviousKm(current.km, km);
      db.prepare("UPDATE vehicles SET km = ?, notes = ? WHERE id = ?").run(km, appendUniqueLine(current.notes, previous), vehicleId);
    }
    if (plan.vehicle === "conflict") vehicleId = null;
    db.prepare("INSERT INTO appointments (customer_id, vehicle_id) VALUES (?, ?)").run(customerId, vehicleId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

applyBooking("30123456", "1123456789", "AB123CD", 10000);
applyBooking("30.123.456", "1123456789", "ab123cd", 12000);
check("dos turnos con el mismo dni y patente dejan un cliente y un vehículo", rows("customers").length === 1 && rows("vehicles").length === 1 && rows("appointments").length === 2);
const kept = rows("vehicles")[0];
check("el segundo turno actualiza el km y guarda el anterior", kept.km === 12000 && String(kept.notes).includes("Km anterior 10000"));

applyBooking("30123456", "1123456789", "AA111BB", 500);
check("un segundo vehículo no duplica al cliente", rows("customers").length === 1 && rows("vehicles").length === 2);

const beforeConflict = rows("vehicles").length;
applyBooking("27999888", "1199990000", "AB123CD", 1);
check("la patente ajena no suma otro vehículo", rows("vehicles").length === beforeConflict && rows("customers").length === 2);

function failMidway() {
  db.exec("BEGIN");
  db.prepare("INSERT INTO customers (document, phone) VALUES (?, ?)").run("555", "1");
  db.prepare("INSERT INTO vehicles (customer_id, plate, km, notes) VALUES (?, ?, ?, ?)").run(99, "ZZ000ZZ", 1, "");
  throw new Error("la reserva falló");
}
const beforeFail = { customers: rows("customers").length, vehicles: rows("vehicles").length };
try {
  failMidway();
} catch {
  db.exec("ROLLBACK");
}
check("si la reserva falla no quedan registros parciales", rows("customers").length === beforeFail.customers && rows("vehicles").length === beforeFail.vehicles);

if (failures.length) {
  console.error("falló:", failures.join(", "));
  process.exit(1);
}
console.log("casos de reutilización ok");
