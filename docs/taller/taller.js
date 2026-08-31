(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");

  const params = new URLSearchParams(window.location.search);
  const slug = (params.get("t") || params.get("slug") || "").trim().toLowerCase();

  const viewSearch = document.getElementById("view-search");
  const viewResults = document.getElementById("view-results");
  const bizName = document.getElementById("biz-name");
  const syncMeta = document.getElementById("sync-meta");
  const searchForm = document.getElementById("search-form");
  const queryInput = document.getElementById("query");
  const searchError = document.getElementById("search-error");
  const btnSearch = document.getElementById("btn-search");
  const btnBack = document.getElementById("btn-back");
  const notFound = document.getElementById("not-found");
  const resultsBody = document.getElementById("results-body");
  const resultsBiz = document.getElementById("results-biz");
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

  function showError(msg) {
    searchError.textContent = msg;
    searchError.hidden = !msg;
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
      syncMeta.textContent = data.updated_at
        ? `Datos actualizados: ${formatWhen(data.updated_at)}`
        : "Datos del taller";
    } catch {
      syncMeta.textContent = "Sin conexión. Revisá internet e intentá de nuevo.";
    }
  }

  function renderResults(data) {
    viewSearch.hidden = true;
    viewResults.hidden = false;
    resultsBiz.textContent = data.business_name || "Taller";
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
      .map((v) => {
        const subtitle = [v.brand, v.model, v.year].filter(Boolean).join(" ");
        const orders = (v.orders || [])
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
              <ul class="items-list">${items || "<li>Sin detalle de repuestos</li>"}</ul>
            </article>`;
          })
          .join("");
        return `<section class="card vehicle-card">
          <h3>${escapeHtml(v.plate)}</h3>
          ${subtitle ? `<p class="vehicle-sub">${escapeHtml(subtitle)}</p>` : ""}
          ${orders}
        </section>`;
      })
      .join("");
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
