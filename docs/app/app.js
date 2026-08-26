(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");
  const TOKEN_KEY = "walqo_portal_token";

  const viewLogin = document.getElementById("view-login");
  const viewDash = document.getElementById("view-dash");
  const btnLogout = document.getElementById("btn-logout");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const btnLogin = document.getElementById("btn-login");
  const btnRefresh = document.getElementById("btn-refresh");

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

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(iso);
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ "content-type": "application/json" }, opts.headers || {});
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Error ${res.status}`);
      err.status = res.status;
      err.code = data.error;
      throw err;
    }
    return data;
  }

  function showLogin() {
    viewLogin.hidden = false;
    viewDash.hidden = true;
    btnLogout.hidden = true;
  }

  function showDash() {
    viewLogin.hidden = true;
    viewDash.hidden = false;
    btnLogout.hidden = false;
  }

  function renderDashboard(data) {
    document.getElementById("biz-name").textContent = data.business_name || "Mi comercio";
    const syncEl = document.getElementById("sync-meta");
    if (data.empty) {
      syncEl.textContent = "Esperando primera subida desde la PC";
      document.getElementById("empty-state").hidden = false;
      document.getElementById("empty-msg").textContent =
        data.message ||
        "En la PC del comercio: Configuración → Panel web del dueño → activá el interruptor.";
      document.getElementById("kpi-grid").hidden = true;
      document.getElementById("lists").hidden = true;
      return;
    }

    document.getElementById("empty-state").hidden = true;
    document.getElementById("kpi-grid").hidden = false;
    document.getElementById("lists").hidden = false;

    const when = data.pushed_at || data.updated_at;
    const device = data.device_name ? ` · ${data.device_name}` : "";
    syncEl.textContent = `Última sync: ${formatWhen(when)}${device}`;

    document.getElementById("kpi-sales").textContent = money(data.sales_today_total);
    document.getElementById("kpi-tickets").textContent = String(data.sales_today_count ?? 0);
    document.getElementById("kpi-low").textContent = String(data.low_stock_count ?? 0);
    document.getElementById("kpi-products").textContent = String(data.products_total ?? 0);

    const salesUl = document.getElementById("sales-list");
    const sales = Array.isArray(data.recent_sales) ? data.recent_sales : [];
    salesUl.innerHTML = sales.length
      ? sales
          .map(
            (s) => `<li>
              <div class="left">
                <strong>${escapeHtml(formatWhen(s.at))}</strong>
                <span>${escapeHtml(s.device || "Caja")}</span>
              </div>
              <div class="right">${escapeHtml(money(s.total))}</div>
            </li>`,
          )
          .join("")
      : `<li><div class="left"><strong>Sin ventas recientes</strong></div></li>`;

    const stockUl = document.getElementById("stock-list");
    const low = Array.isArray(data.low_stock) ? data.low_stock : [];
    stockUl.innerHTML = low.length
      ? low
          .map(
            (p) => `<li>
              <div class="left">
                <strong>${escapeHtml(p.name || "?")}</strong>
                <span>Mín. ${escapeHtml(String(p.min_stock ?? 0))}</span>
              </div>
              <div class="right">${escapeHtml(String(p.stock ?? 0))}</div>
            </li>`,
          )
          .join("")
      : `<li><div class="left"><strong>Sin alertas de stock</strong></div></li>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadDashboard() {
    const data = await api("/v1/portal/dashboard");
    renderDashboard(data);
  }

  async function boot() {
    if (!getToken()) {
      showLogin();
      return;
    }
    try {
      await api("/v1/portal/me");
      showDash();
      await loadDashboard();
    } catch {
      setToken("");
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    btnLogin.disabled = true;
    try {
      const data = await api("/v1/portal/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
        }),
      });
      setToken(data.token);
      showDash();
      await loadDashboard();
    } catch (err) {
      loginError.textContent = err.message || "No se pudo iniciar sesión";
      loginError.hidden = false;
    } finally {
      btnLogin.disabled = false;
    }
  });

  btnLogout.addEventListener("click", async () => {
    try {
      await api("/v1/portal/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    setToken("");
    showLogin();
  });

  btnRefresh.addEventListener("click", async () => {
    btnRefresh.disabled = true;
    try {
      await loadDashboard();
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        showLogin();
      }
    } finally {
      btnRefresh.disabled = false;
    }
  });

  void boot();
})();
