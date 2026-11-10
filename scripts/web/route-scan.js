// Pegar en la consola de WalQo Web (o por CDP) con la sesión del admin abierta:
// recorre las pantallas y junta errores de React y comandos que el servidor rechazó.
(async () => {
  const report = {};
  let current = "";
  const note = (msg) => (report[current] ??= new Set()).add(msg);
  const originalFetch = window.fetch;
  window.fetch = async function (url, opts) {
    const res = await originalFetch.apply(this, arguments);
    if (String(url).includes("/v1/")) {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      const data = await res.clone().json().catch(() => null);
      if (data && !data.ok) {
        const what = body.m ? `${body.m}.${body.f}` : body.cmd || String(body.sql || "").slice(0, 50);
        note(`RECHAZO ${what}: ${data.error.message.slice(0, 120)}`);
      }
    }
    return res;
  };
  const onError = (e) => note(`ERROR ${(e.error?.message || e.message || "").slice(0, 160)}`);
  const onReject = (e) => note(`PROMESA ${String(e.reason?.message || e.reason).slice(0, 160)}`);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  const routes = window.__walqoRoutes || [
    "/", "/pos", "/productos", "/stock", "/proveedores", "/clientes", "/caja", "/gastos",
    "/tesoreria", "/ventas", "/reportes", "/facturacion", "/asistente", "/auditoria", "/ayuda",
    "/empleados", "/admin", "/presupuestos", "/remitos", "/ordenes", "/turnos",
  ];
  for (const route of routes) {
    current = route;
    location.hash = "#" + route;
    await new Promise((r) => setTimeout(r, 3000));
    if (document.body.innerText.trim().length === 0) note("PANTALLA EN BLANCO");
  }
  window.fetch = originalFetch;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onReject);
  return Object.entries(report)
    .map(([route, msgs]) => `${route}\n  ${[...msgs].join("\n  ")}`)
    .join("\n");
})();
