#!/usr/bin/env node
/**
 * Recordatorio liviano del flujo visual WalQo.
 * No lanza navegador ni toca datos: solo imprime el checklist.
 * Capturas reales: Playwright MCP, browser MCP o tests/ existentes.
 */
const screens = [
  "Login",
  "Inicio",
  "POS",
  "Productos",
  "Stock",
  "Clientes",
  "Caja",
  "Tesorería",
  "Reportes",
  "Configuración",
];

const viewports = ["390×844", "1366×768", "1600×900", "1920×1080"];

console.log("WalQo visual QA (hint)");
console.log("Docs: docs/design/UI_UX_WORKFLOW.md");
console.log("Checklist: docs/design/visual-checklist.md");
console.log("");
console.log("Pantallas:");
for (const s of screens) console.log(`  - ${s}`);
console.log("");
console.log("Viewports:", viewports.join(", "));
console.log("Temas: claro + oscuro");
console.log("");
console.log("Dev Desktop: npm run tauri dev");
console.log("Dev Web:     npm run dev:web");
console.log("E2E:         npm run test:e2e  (suite existente; no inflar)");
console.log("");
console.log("Compilar ≠ listo. Capturar y revisar antes de cerrar la UI.");
