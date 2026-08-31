(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");

  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("t") || params.get("slug") || "").trim().toLowerCase();

  const viewSearch = document.getElementById("view-search");
  const viewResults = document.getElementById("view-results");
  const bizName = document.getElementById("biz-name");
  const bizLogo = document.getElementById("biz-logo");
  const syncMeta = document.getElementById("sync-meta");
  const searchForm = document.getElementById("search-form");
  const queryInput = document.getElementById("query");
  const searchError = document.getElementById("search-error");
  const btnSearch = document.getElementById("btn-search");
  const btnBack = document.getElementById("btn-back");
  const notFound = document.getElementById("not-found");
  const resultsBody = document.getElementById("results-body");
  const resultsBiz = document.getElementById("results-biz");
  const resultsLogo = document.getElementById("results-logo");
  const resultsTitle = document.getElementById("results-title");
  const resultsMeta = document.getElementById("results-meta");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso);
    }
  }

  function money(n) {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `$ ${Math.round(v)}`;
    }
  }

  function showLogo(el, url) {
    if (!el) return;
    if (url) {
      el.src = url;
      el.hidden = false;
    } else {
      el.hidden = true;
      el.removeAttribute("src");
    }
  }

  function showError(msg) {
    searchError.textContent = msg;
    searchError.hidden = !msg;
  }

  function field(label, value) {
    const v = value?.trim?.() ? escapeHtml(value) : "—";
    return `<p><strong>${escapeHtml(label)}:</strong> ${v}</p>`;
  }

  function printInspection(ins, plate, biz) {
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(ins.inspection_number)}</title>
<style>
@page{margin:14mm}body{font-family:system-ui,sans-serif;font-size:12px;color:#0f172a;line-height:1.45}
h1{font-size:18px;margin:0 0 8px}h2{font-size:14px;margin:16px 0 8px}
.muted{color:#64748b;font-size:11px}
</style></head><body>
<h1>Peritaje de ingreso ${escapeHtml(ins.inspection_number)}</h1>
<p class="muted">${escapeHtml(biz)} · ${escapeHtml(plate)} · ${formatWhen(ins.date)}</p>
<h2>Estado del vehículo al ingresar</h2>
${ins.order_number ? field("Orden vinculada", ins.order_number) : ""}
${ins.odometer_km != null ? field("Kilometraje", `${Math.round(ins.odometer_km).toLocaleString("es-AR")} km`) : field("Kilometraje", null)}
${field("Combustible", ins.fuel_level)}
${field("Estado exterior", ins.exterior_condition)}
${field("Estado interior", ins.interior_condition)}
${field("Pertenencias", ins.belongings)}
${field("Problemas reportados", ins.customer_reported)}
${field("Observaciones", ins.notes)}
${field("Recibido por", ins.received_by)}
<p class="muted" style="margin-top:20px">Documento de ingreso · WalQo</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("No se pudo abrir la impresión. Permití ventanas emergentes.");
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  async function loadInfo() {
    if (!slug) {
      bizName.textContent = "Taller";
      syncMeta.textContent = "Falta el código del taller en el enlace del QR.";
      btnSearch.disabled = true;
      return;
    }
    try {
      const res = await fetch(`${API}/v1/workshop-portal/info?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        bizName.textContent = "Taller";
        syncMeta.textContent = data.message || "Taller no encontrado o sin datos publicados aún.";
        return;
      }
      bizName.textContent = data.business_name || "Taller";
      showLogo(bizLogo, data.logo_data_url);
      syncMeta.textContent = data.updated_at
        ? `Datos actualizados: ${formatWhen(data.updated_at)}`
        : "Datos del taller";
    } catch {
      syncMeta.textContent = "Sin conexión. Revisá internet e intentá de nuevo.";
    }
  }

  function renderOrders(orders) {
    if (!orders?.length) return "";
    return `<div class="section-block">
      <h3 class="section-title">Reparaciones</h3>
      ${orders
        .map((o) => {
          const items = (o.items || [])
            .map(
              (it) =>
                `<li><span>${escapeHtml(it.name)}${
                  it.is_labor ? '<span class="item-tag">mano de obra</span>' : ""
                }</span><span>×${Number(it.qty) || 1}</span></li>`,
            )
            .join("");
          const km =
            o.odometer_km != null && o.odometer_km > 0
              ? ` · ${Math.round(o.odometer_km).toLocaleString("es-AR")} km`
              : "";
          return `<article class="order-card">
            <div class="order-head">
              <h4>${escapeHtml(o.title || "Trabajo")}</h4>
              <span class="status-pill ${escapeHtml(o.status || "")}">${escapeHtml(
                o.status_label || o.status || "",
              )}</span>
            </div>
            <p class="order-meta">${escapeHtml(o.order_number || "")} · ${formatWhen(o.date)}${km}</p>
            <ul class="items-list">${items || "<li>Sin detalle</li>"}</ul>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderQuotes(quotes) {
    if (!quotes?.length) return "";
    return `<div class="section-block">
      <h3 class="section-title">Presupuestos</h3>
      ${quotes
        .map((q) => {
          const items = (q.items || [])
            .map(
              (it) =>
                `<li><span>${escapeHtml(it.name)}</span><span>×${Number(it.qty) || 1}</span></li>`,
            )
            .join("");
          const valid = q.valid_until ? ` · Vence ${formatWhen(q.valid_until)}` : "";
          const total = q.total != null ? ` · ${money(q.total)}` : "";
          return `<article class="order-card quote-card">
            <div class="order-head">
              <h4>${escapeHtml(q.quote_number || "Presupuesto")}</h4>
              <span class="status-pill quote">${escapeHtml(q.status_label || q.status || "")}</span>
            </div>
            <p class="order-meta">${formatWhen(q.date)}${valid}${total}</p>
            <ul class="items-list">${items || "<li>Sin ítems</li>"}</ul>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  function renderInspections(inspections, vehicleIdx) {
    if (!inspections?.length) return "";
    return `<div class="section-block">
      <h3 class="section-title">Peritajes de ingreso</h3>
      ${inspections
        .map((ins, idx) => {
          return `<article class="order-card inspection-card">
            <div class="order-head">
              <h4>${escapeHtml(ins.inspection_number)}</h4>
              <button type="button" class="btn-secondary btn-small" data-vehicle-idx="${vehicleIdx}" data-ins-idx="${idx}">PDF / Imprimir</button>
            </div>
            <p class="order-meta">${formatWhen(ins.date)}${
              ins.order_number ? ` · ${escapeHtml(ins.order_number)}` : ""
            }</p>
            <div class="inspection-preview">
              ${field("Combustible", ins.fuel_level)}
              ${field("Exterior", ins.exterior_condition)}
              ${field("Interior", ins.interior_condition)}
            </div>
          </article>`;
        })
        .join("")}
    </div>`;
  }

  let lastLookup = null;

  function bindInspectionPrint() {
    document.querySelectorAll("[data-ins-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!lastLookup) return;
        const vIdx = Number(btn.getAttribute("data-vehicle-idx"));
        const iIdx = Number(btn.getAttribute("data-ins-idx"));
        const vehicle = lastLookup.vehicles?.[vIdx];
        const ins = vehicle?.inspections?.[iIdx];
        if (!vehicle || !ins) return;
        printInspection(ins, vehicle.plate, lastLookup.business_name || "Taller");
      });
    });
  }

  function renderResults(data) {
    viewSearch.hidden = true;
    viewResults.hidden = false;
    resultsBiz.textContent = data.business_name || "Taller";
    showLogo(resultsLogo, data.logo_data_url);
    resultsMeta.textContent = data.updated_at
      ? `Actualizado: ${formatWhen(data.updated_at)}`
      : "";

    if (!data.found || !data.vehicles?.length) {
      resultsTitle.textContent = "Sin historial";
      notFound.hidden = false;
      resultsBody.hidden = true;
      return;
    }

    notFound.hidden = true;
    resultsBody.hidden = false;
    resultsTitle.textContent =
      data.vehicles.length === 1 ? `Patente ${data.vehicles[0].plate}` : `${data.vehicles.length} vehículos`;

    resultsBody.innerHTML = data.vehicles
      .map((v, vehicleIdx) => {
        const subtitle = [v.brand, v.model, v.year].filter(Boolean).join(" ");
        return `<section class="card vehicle-card">
          <h3>${escapeHtml(v.plate)}</h3>
          ${subtitle ? `<p class="vehicle-sub">${escapeHtml(subtitle)}</p>` : ""}
          ${renderOrders(v.orders)}
          ${renderQuotes(v.quotes)}
          ${renderInspections(v.inspections, vehicleIdx)}
        </section>`;
      })
      .join("");

    lastLookup = data;
    bindInspectionPrint();
  }

  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const q = queryInput.value.trim();
    if (!q) return;
    if (!slug) {
      showError("Enlace inválido. Escaneá el QR del taller.");
      return;
    }
    const mode = searchForm.querySelector('input[name="mode"]:checked')?.value || "plate";
    btnSearch.disabled = true;
    btnSearch.textContent = "Buscando…";
    try {
      const url = `${API}/v1/workshop-portal/lookup?slug=${encodeURIComponent(
        slug,
      )}&q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showError(data.message || "No se pudo buscar. Intentá de nuevo.");
        return;
      }
      renderResults(data);
    } catch {
      showError("Sin conexión. Revisá internet e intentá de nuevo.");
    } finally {
      btnSearch.disabled = false;
      btnSearch.textContent = "Buscar historial";
    }
  });

  btnBack.addEventListener("click", () => {
    viewResults.hidden = true;
    viewSearch.hidden = false;
    notFound.hidden = true;
    resultsBody.hidden = true;
    showError("");
  });

  void loadInfo();
})();
