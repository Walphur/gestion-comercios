import { resourceAllowed, rangesOverlap, sameResource, slotInsideHours } from "../src/lib/appointmentRules.ts";

const failures = [];
function check(name, condition) {
  if (!condition) failures.push(name);
  else console.log("ok", name);
}

const ortodoncia = [2];
const general = [1, 2];
check("ortodoncia solo habilita a su profesional", resourceAllowed(ortodoncia, 2, true) === "ok");
check("ortodoncia rechaza a otro profesional", resourceAllowed(ortodoncia, 1, true) === "not-allowed");
check("el mismo profesional entra en general y en limpieza", resourceAllowed(general, 1, true) === "ok" && resourceAllowed([1], 1, true) === "ok");
check("clínica sin profesionales habilitados no deja seguir", resourceAllowed([], 1, true) === "missing-staff");
check("taller sin lista sigue aceptando a cualquiera", resourceAllowed([], 1, false) === "ok");
check("un servicio que no es del catálogo no restringe", resourceAllowed(null, 9, true) === "ok");
check("hay que elegir profesional si el servicio tiene lista", resourceAllowed([2], null, true) === "need-resource");

check("dos turnos del mismo profesional se pisan", rangesOverlap("2026-10-16 12:00:00", "2026-10-16 13:00:00", "2026-10-16 12:30:00", "2026-10-16 13:30:00"));
check("un turno que termina cuando empieza el otro no se pisa", !rangesOverlap("2026-10-16 12:00:00", "2026-10-16 13:00:00", "2026-10-16 13:00:00", "2026-10-16 14:00:00"));
check("otro profesional no se bloquea por el horario", !sameResource(1, "Ana", 2, "Luis"));
check("el mismo profesional se reconoce por id", sameResource(2, null, 2, "Luis"));

const hours = JSON.stringify({ days: [1, 2, 3, 4, 5], open: "09:00", close: "19:00" });
check("el horario de atención acepta las 12", slotInsideHours("2026-10-16 12:00:00", "2026-10-16 13:00:00", hours));
check("el horario de atención rechaza las 20", !slotInsideHours("2026-10-16 20:00:00", "2026-10-16 21:00:00", hours));
check("el domingo no está en la semana configurada", !slotInsideHours("2026-10-18 12:00:00", "2026-10-18 13:00:00", hours));
check("sin horario cargado no se bloquea", slotInsideHours("2026-10-16 20:00:00", "2026-10-16 21:00:00", null));

if (failures.length) {
  console.error("falló:", failures.join(", "));
  process.exit(1);
}
console.log("reglas de agenda ok");
