(() => {
  const API =
    (window.WALQO_LICENSE_API_URL ||
      "https://gestion-comercios-license.walphur.workers.dev").replace(/\/$/, "");
  const TOKEN_KEY = "walqo_portal_token";
  const POLL_MS = 45 * 1000;
  /** Snapshot fresco: menos de 15 min */
  const FRESH_MS = 15 * 60 * 1000;
  /** Snapshot desactualizado: 15–60 min */
  const STALE_MS = 60 * 60 * 1000;

  const viewLogin = document.getElementById("view-login");
  const viewDash = document.getElementById("view-dash");
  const btnLogout = document.getElementById("btn-logout");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const btnLogin = document.getElementById("btn-login");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnRetry = document.getElementById("btn-retry");
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("error-state");
  const emptyState = document.getElementById("empty-state");
  const dashBody = document.getElementById("dash-body");

  let pollTimer = null;
  /** Último dashboard cargado (para cambiar de período sin refetch). */
  let lastDashboard = null;
  let selectedPeriod = "today";
  /** F4D: expandir lista Atención más allá del preview. */
  let attentionExpanded = false;
  /** F4E-4: estado de Inteligencia WalQo (no auto-fetch al cambiar período). */
  let portalAccountKey = "";
  let iaUi = {
    status: "idle", // idle | loading | success | error | nosnapshot
    periodKey: null,
    result: null,
    errorMsg: null,
  };
  /** Evita requests duplicadas concurrentes. */
  let iaInflight = false;
  /** Cache en memoria por período (sesión actual). */
  const iaMemoryCache = new Map();

  const ATTENTION_PREVIEW = 8;
  const ATTENTION_SEVERITIES = { critical: true, warning: true, info: true };

  const PAYMENT_LABELS = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    debito: "Débito",
    credito: "Crédito",
    transferencia: "Transferencia",
    mercadopago: "Mercado Pago",
    payway: "Payway QR",
    fiado: "Fiado",
    cuenta_corriente: "Fiado",
  };

  const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

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

  function moneyShort(n) {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
    return money(v);
  }

  function avgTicket(total, count) {
    const c = Number(count) || 0;
    if (c <= 0) return 0;
    return (Number(total) || 0) / c;
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

  /** Tiempo relativo honesto desde pushed_at / updated_at. */
  function relativeAgo(iso) {
    if (!iso) return { text: "Sin fecha de actualización", ageMs: null };
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return { text: "Sin fecha de actualización", ageMs: null };
    const ageMs = Math.max(0, Date.now() - t);
    const mins = Math.floor(ageMs / 60000);
    if (mins < 1) return { text: "Actualizado hace instantes", ageMs };
    if (mins < 60) return { text: `Actualizado hace ${mins} min`, ageMs };
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      const rem = mins % 60;
      return {
        text: rem > 0 ? `Actualizado hace ${hours} h ${rem} min` : `Actualizado hace ${hours} h`,
        ageMs,
      };
    }
    const days = Math.floor(hours / 24);
    return { text: `Actualizado hace ${days} día${days === 1 ? "" : "s"}`, ageMs };
  }

  function snapshotHealth(ageMs) {
    if (ageMs == null) {
      return {
        level: "stale",
        title: "Datos desactualizados",
        cls: "status-card--warn",
      };
    }
    if (ageMs <= FRESH_MS) {
      return {
        level: "ok",
        title: "Todo funciona normalmente",
        cls: "status-card--ok",
      };
    }
    if (ageMs <= STALE_MS) {
      return {
        level: "stale",
        title: "Datos desactualizados",
        cls: "status-card--warn",
      };
    }
    return {
      level: "old",
      title: "Sin datos recientes",
      cls: "status-card--danger",
    };
  }

  function paymentLabel(method) {
    if (!method) return "";
    const key = String(method)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    return PAYMENT_LABELS[key] || method;
  }

  /** Mapea tab UI → clave F3 del snapshot. */
  function periodMapKey(period) {
    if (period === "month") return "mtd";
    if (period === "7d" || period === "30d" || period === "today") return period;
    return "today";
  }

  function periodTitleSuffix(period) {
    if (period === "7d") return "7 días";
    if (period === "30d") return "30 días";
    if (period === "month") return "este mes";
    return "hoy";
  }

  function hasPeriodMap(map) {
    return map != null && typeof map === "object" && !Array.isArray(map);
  }

  function rowsFromPeriodMap(map, period) {
    if (!hasPeriodMap(map)) return null;
    const key = periodMapKey(period);
    const rows = map[key];
    return Array.isArray(rows) ? rows : [];
  }

  function registerLabel(row) {
    const name = row.device_name?.trim();
    if (name) return name;
    const code = row.device_code?.trim();
    return code && code !== "—" ? code : "Caja";
  }

  function stockClass(stock, minStock) {
    const s = Number(stock) || 0;
    const m = Number(minStock) || 0;
    if (s < 0) return "stock-critical";
    if (m > 0 && s <= m) return "stock-warn";
    return "";
  }

  function dayLabel(isoDay) {
    try {
      const [y, m, d] = String(isoDay).split("-").map(Number);
      if (!y || !m || !d) return isoDay;
      const dt = new Date(y, m - 1, d);
      return DOW[dt.getDay()] || isoDay.slice(5);
    } catch {
      return String(isoDay).slice(5);
    }
  }

  function vsYesterday(today, yesterday) {
    const t = Number(today) || 0;
    const y = Number(yesterday) || 0;
    if (y <= 0) return { text: "Sin comparación", cls: "flat" };
    const pct = ((t - y) / y) * 100;
    const abs = Math.abs(Math.round(pct));
    if (abs < 1) return { text: "Igual que ayer", cls: "flat" };
    if (pct > 0) return { text: `↑ ${abs}% vs ayer`, cls: "up" };
    return { text: `↓ ${abs}% vs ayer`, cls: "down" };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
    if (!t) {
      portalAccountKey = "";
      iaMemoryCache.clear();
      clearIaSessionCacheAll();
      resetIntelligenceUi();
    }
  }

  function clearIaSessionCacheAll() {
    try {
      const keys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("walqo_portal_ia:")) keys.push(k);
      }
      for (const k of keys) sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  function iaCacheStorageKey(periodKey, pushedAt) {
    if (!portalAccountKey || !periodKey || !pushedAt) return null;
    return `walqo_portal_ia:${portalAccountKey}:${periodKey}:${pushedAt}`;
  }

  function readIaCache(periodKey, pushedAt) {
    const mem = iaMemoryCache.get(`${periodKey}|${pushedAt || ""}`);
    if (mem) return mem;
    const sk = iaCacheStorageKey(periodKey, pushedAt);
    if (!sk) return null;
    try {
      const raw = sessionStorage.getItem(sk);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.summary !== "string") return null;
      iaMemoryCache.set(`${periodKey}|${pushedAt || ""}`, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  function writeIaCache(periodKey, pushedAt, result) {
    iaMemoryCache.set(`${periodKey}|${pushedAt || ""}`, result);
    const sk = iaCacheStorageKey(periodKey, pushedAt);
    if (!sk) return;
    try {
      sessionStorage.setItem(sk, JSON.stringify(result));
    } catch {
      /* quota / private mode */
    }
  }

  function resetIntelligenceUi() {
    iaUi = { status: "idle", periodKey: null, result: null, errorMsg: null };
    iaInflight = false;
  }

  /** Mensaje de error seguro para el dueño (sin detalles internos). */
  function intelligenceErrorMessage(err) {
    const status = err && err.status;
    if (status === 401) return "Tu sesión expiró. Volvé a iniciar sesión.";
    if (status === 404) return "Sin datos suficientes para generar un análisis.";
    if (status === 422) return "Los datos no pudieron validarse para el análisis.";
    if (status === 429) return "Alcanzaste el límite de análisis disponible.";
    if (status === 502) return "No se pudo conectar con el servicio de inteligencia.";
    if (status === 504) return "El análisis está tardando demasiado. Intentá nuevamente.";
    return "No se pudo completar el análisis. Intentá nuevamente.";
  }

  function fillTextList(ul, items) {
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    const list = Array.isArray(items)
      ? items.filter((x) => typeof x === "string" && x.trim())
      : [];
    if (!list.length) {
      ul.setAttribute("data-empty", "1");
      const li = document.createElement("li");
      li.textContent = "Sin ítems para mostrar.";
      ul.appendChild(li);
      return;
    }
    ul.removeAttribute("data-empty");
    for (const text of list.slice(0, 5)) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    }
  }

  function ctaLabelForStatus(status, hasResult) {
    if (status === "loading") return "Analizando…";
    if (hasResult || status === "success") return "Actualizar análisis";
    return "Analizar este período";
  }

  function renderIntelligence() {
    const btn = document.getElementById("btn-intelligence");
    const emptyEl = document.getElementById("intelligence-empty");
    const actionsEl = document.getElementById("intelligence-actions");
    const loadingEl = document.getElementById("intelligence-loading");
    const errorEl = document.getElementById("intelligence-error");
    const errorMsg = document.getElementById("intelligence-error-msg");
    const resultEl = document.getElementById("intelligence-result");
    const staleEl = document.getElementById("intelligence-stale-note");
    const periodLabel = document.getElementById("intelligence-period-label");
    if (!btn || !emptyEl || !actionsEl || !loadingEl || !errorEl || !resultEl) return;

    const hasSnap = !!(lastDashboard && !lastDashboard.empty);
    const periodKey = periodMapKey(selectedPeriod);
    const when = lastDashboard
      ? lastDashboard.pushed_at || lastDashboard.updated_at
      : null;
    const ago = relativeAgo(when);
    const health = snapshotHealth(ago.ageMs);

    if (periodLabel) {
      periodLabel.textContent = `Período: ${periodTitleSuffix(selectedPeriod)}`;
    }

    if (staleEl) {
      if (hasSnap && (health.level === "stale" || health.level === "old")) {
        staleEl.hidden = false;
        staleEl.textContent =
          "El análisis utiliza datos que no están completamente actualizados.";
      } else {
        staleEl.hidden = true;
        staleEl.textContent = "";
      }
    }

    // Cache por período: no auto-fetch; solo restaurar resultado ya obtenido.
    if (hasSnap && iaUi.status !== "loading") {
      if (iaUi.periodKey !== periodKey) {
        const cached = readIaCache(periodKey, when || "");
        iaUi = cached
          ? { status: "success", periodKey, result: cached, errorMsg: null }
          : { status: "idle", periodKey, result: null, errorMsg: null };
      } else if (iaUi.status !== "error" && iaUi.status !== "success") {
        const cached = readIaCache(periodKey, when || "");
        if (cached) {
          iaUi = { status: "success", periodKey, result: cached, errorMsg: null };
        }
      }
    }

    if (!hasSnap) {
      emptyEl.hidden = false;
      actionsEl.hidden = true;
      loadingEl.hidden = true;
      errorEl.hidden = true;
      resultEl.hidden = true;
      btn.disabled = true;
      btn.textContent = "Analizar este período";
      return;
    }

    emptyEl.hidden = true;
    actionsEl.hidden = false;

    const loading = iaUi.status === "loading";
    const hasResult = !!(iaUi.result && iaUi.status === "success");
    btn.disabled = loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.textContent = ctaLabelForStatus(iaUi.status, hasResult);

    loadingEl.hidden = !loading;
    errorEl.hidden = iaUi.status !== "error";
    if (iaUi.status === "error" && errorMsg) {
      errorMsg.textContent = iaUi.errorMsg || "No se pudo completar el análisis.";
    }

    if (hasResult && iaUi.result) {
      resultEl.hidden = false;
      const summaryEl = document.getElementById("intelligence-summary");
      if (summaryEl) summaryEl.textContent = String(iaUi.result.summary || "");
      fillTextList(
        document.getElementById("intelligence-insights"),
        iaUi.result.insights,
      );
      fillTextList(
        document.getElementById("intelligence-recommendations"),
        iaUi.result.recommendations,
      );
      fillTextList(
        document.getElementById("intelligence-uncertainty"),
        iaUi.result.uncertainty,
      );
    } else {
      resultEl.hidden = true;
    }
  }

  async function runIntelligence({ force } = {}) {
    if (iaInflight) return;
    if (!lastDashboard || lastDashboard.empty) {
      iaUi = {
        status: "nosnapshot",
        periodKey: periodMapKey(selectedPeriod),
        result: null,
        errorMsg: null,
      };
      renderIntelligence();
      return;
    }

    const periodKey = periodMapKey(selectedPeriod);
    const when = lastDashboard.pushed_at || lastDashboard.updated_at || "";
    if (!force) {
      const cached = readIaCache(periodKey, when);
      if (cached) {
        iaUi = { status: "success", periodKey, result: cached, errorMsg: null };
        renderIntelligence();
        return;
      }
    }

    iaInflight = true;
    iaUi = { status: "loading", periodKey, result: iaUi.result, errorMsg: null };
    renderIntelligence();

    try {
      // Únicamente period — nunca metrics/alerts/aid/lid/snapshot.
      const body = JSON.stringify({ period: periodKey });
      const data = await api("/v1/portal/interpret", {
        method: "POST",
        body,
      });
      const result = {
        summary: typeof data.summary === "string" ? data.summary : "",
        insights: Array.isArray(data.insights) ? data.insights : [],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
        uncertainty: Array.isArray(data.uncertainty) ? data.uncertainty : [],
      };
      if (!result.summary.trim()) {
        const err = new Error("interpretation_invalid");
        err.status = 422;
        throw err;
      }
      writeIaCache(periodKey, when, result);
      iaUi = { status: "success", periodKey, result, errorMsg: null };
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        showLogin();
        return;
      }
      iaUi = {
        status: "error",
        periodKey,
        result: null,
        errorMsg: intelligenceErrorMessage(err),
      };
    } finally {
      iaInflight = false;
      renderIntelligence();
    }
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
    stopPoll();
  }

  function showDash() {
    viewLogin.hidden = true;
    viewDash.hidden = false;
    btnLogout.hidden = false;
    startPoll();
  }

  function setViewMode(mode) {
    loadingState.hidden = mode !== "loading";
    errorState.hidden = mode !== "error";
    emptyState.hidden = mode !== "empty";
    dashBody.hidden = mode !== "dash";
  }

  function startPoll() {
    stopPoll();
    pollTimer = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function dayLabelShort(isoDay) {
    try {
      const parts = String(isoDay).split("-");
      if (parts.length < 3) return dayLabel(isoDay);
      return `${parts[2]}/${parts[1]}`;
    } catch {
      return dayLabel(isoDay);
    }
  }

  function periodCompareLabel(compare) {
    if (!compare || typeof compare !== "object") {
      return { text: "Sin comparación disponible", cls: "flat" };
    }
    const prev = Number(compare.previous_total) || 0;
    const cur = Number(compare.current_total) || 0;
    const deltaAbs = cur - prev;
    const sign = deltaAbs > 0 ? "+" : deltaAbs < 0 ? "−" : "";
    const absMoney = money(Math.abs(deltaAbs));
    if (prev <= 0) {
      if (cur <= 0) return { text: "Sin comparación disponible", cls: "flat" };
      return {
        text: `${sign}${absMoney} vs período anterior`,
        cls: deltaAbs > 0 ? "up" : deltaAbs < 0 ? "down" : "flat",
      };
    }
    const pct = ((cur - prev) / prev) * 100;
    const pctAbs = Math.abs(pct);
    const pctStr =
      pctAbs < 0.1
        ? "0%"
        : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${pctAbs.toLocaleString("es-AR", {
            maximumFractionDigits: 1,
            minimumFractionDigits: pctAbs < 10 ? 1 : 0,
          })}%`;
    if (Math.abs(deltaAbs) < 1 && pctAbs < 1) {
      return { text: "Igual que el período anterior", cls: "flat" };
    }
    const cls = deltaAbs > 0 || pct > 0 ? "up" : deltaAbs < 0 || pct < 0 ? "down" : "flat";
    return {
      text: `${sign}${absMoney} · ${pctStr}`,
      cls,
    };
  }

  function seriesForPeriod(data, period) {
    if (period === "7d") {
      return {
        series: Array.isArray(data.sales_last_7_days) ? data.sales_last_7_days : [],
        label: "7 días",
        compare: data.period_compare_7d,
        available: true,
      };
    }
    if (period === "30d") {
      const series = Array.isArray(data.sales_last_30_days) ? data.sales_last_30_days : [];
      return {
        series,
        label: "30 días",
        compare: data.period_compare_30d,
        available: series.length > 0,
      };
    }
    if (period === "month") {
      const series = Array.isArray(data.sales_month_to_date) ? data.sales_month_to_date : [];
      return {
        series,
        label: "Este mes",
        compare: null,
        available: series.length > 0,
      };
    }
    // today: single bar from today totals
    const todayKey = (() => {
      const n = new Date();
      return [
        n.getFullYear(),
        String(n.getMonth() + 1).padStart(2, "0"),
        String(n.getDate()).padStart(2, "0"),
      ].join("-");
    })();
    return {
      series: [
        {
          day: todayKey,
          count: data.sales_today_count ?? 0,
          total: data.sales_today_total ?? 0,
        },
      ],
      label: "Hoy",
      compare: null,
      vsYesterday: true,
      available: true,
    };
  }

  function updatePeriodTabs() {
    document.querySelectorAll(".period-tab").forEach((btn) => {
      const p = btn.getAttribute("data-period");
      const has30 = Array.isArray(lastDashboard?.sales_last_30_days) && lastDashboard.sales_last_30_days.length > 0;
      const hasMonth = Array.isArray(lastDashboard?.sales_month_to_date) && lastDashboard.sales_month_to_date.length > 0;
      if (p === "30d") btn.disabled = !has30;
      if (p === "month") btn.disabled = !hasMonth;
      btn.classList.toggle("is-active", p === selectedPeriod);
    });
  }

  function renderSalesPeriod(data) {
    updatePeriodTabs();
    const info = seriesForPeriod(data, selectedPeriod);
    const summaryEl = document.getElementById("period-summary");
    const chartEl = document.getElementById("week-chart");
    const footEl = document.getElementById("week-total");
    const chartCard = chartEl?.closest(".chart-card");

    function setSoloCard(solo) {
      if (chartCard) chartCard.classList.toggle("chart-card--solo", !!solo);
    }

    if (!info.available || !info.series.length) {
      summaryEl.innerHTML = `<p class="period-summary__note">Este período todavía no tiene datos publicados desde la PC.</p>`;
      chartEl.hidden = false;
      chartEl.innerHTML = `<p class="compare-meta">Sin historial para mostrar.</p>`;
      chartEl.className = "bar-chart bar-chart--empty";
      chartEl.style.gridTemplateColumns = "";
      footEl.textContent = "";
      setSoloCard(true);
      return;
    }

    const series = info.series;
    const total = series.reduce((a, d) => a + (Number(d.total) || 0), 0);
    const count = series.reduce((a, d) => a + (Number(d.count) || 0), 0);
    const avg = avgTicket(total, count);

    let compareHtml = "";
    if (selectedPeriod === "today") {
      const delta = vsYesterday(data.sales_today_total ?? 0, data.sales_yesterday_total ?? 0);
      compareHtml = `<p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>`;
    } else if (info.compare) {
      const delta = periodCompareLabel(info.compare);
      compareHtml = `<p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>`;
    } else if (selectedPeriod === "month") {
      compareHtml = `<p class="kpi-hint flat">Sin comparación disponible</p>`;
    }

    summaryEl.innerHTML = `
      <div class="period-summary__main min-w-0">
        <p class="period-summary__label">${escapeHtml(info.label)}</p>
        <p class="period-summary__total">${escapeHtml(money(total))}</p>
        ${compareHtml}
      </div>
      <div class="period-summary__side">
        <p><strong>${escapeHtml(String(count))}</strong> tickets</p>
        <p>Promedio ${escapeHtml(money(avg))}</p>
      </div>`;

    // Hoy = 1 barra: el resumen ya muestra el total; un chart de 150px queda vacío.
    if (series.length <= 1) {
      chartEl.hidden = true;
      chartEl.innerHTML = "";
      chartEl.className = "bar-chart";
      chartEl.style.gridTemplateColumns = "";
      footEl.textContent = "";
      setSoloCard(true);
      return;
    }

    setSoloCard(false);
    chartEl.hidden = false;
    const maxRaw = Math.max(...series.map((d) => Number(d.total) || 0), 0);
    const allZero = maxRaw <= 0;
    const max = Math.max(maxRaw, 1);
    const todayKey = (() => {
      const n = new Date();
      return [
        n.getFullYear(),
        String(n.getMonth() + 1).padStart(2, "0"),
        String(n.getDate()).padStart(2, "0"),
      ].join("-");
    })();

    const many = series.length > 14;
    const plotMax = allZero ? 36 : many ? 100 : 110;
    chartEl.className = [
      "bar-chart",
      many ? "bar-chart--dense" : "",
      allZero ? "bar-chart--flat" : "",
    ]
      .filter(Boolean)
      .join(" ");
    chartEl.style.gridTemplateColumns = `repeat(${series.length}, minmax(0, 1fr))`;

    chartEl.innerHTML = series
      .map((d) => {
        const h = allZero
          ? 4
          : Math.max(4, Math.round(((Number(d.total) || 0) / max) * plotMax));
        const isToday = d.day === todayKey;
        const label = many ? dayLabelShort(d.day) : dayLabel(d.day);
        const showVal = !allZero && (!many || series.length <= 20);
        return `<div class="bar-col">
          ${showVal ? `<span class="bar-val">${escapeHtml(moneyShort(d.total))}</span>` : `<span class="bar-val" aria-hidden="true"></span>`}
          <div class="bar${isToday ? " is-today" : ""}" style="height:${h}px" title="${escapeHtml(money(d.total))} · ${escapeHtml(String(d.count || 0))} tickets"></div>
          <span class="bar-label">${escapeHtml(label)}</span>
        </div>`;
      })
      .join("");

    footEl.textContent = `Total ${info.label.toLowerCase()}: ${money(total)}`;
  }

  function renderEmptyList(ul, title, sub) {
    ul.innerHTML = `<li><div class="left"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(sub)}</span></div></li>`;
  }

  /** Solo presentación — no calcula BI. Descarta ítems malformados. */
  function normalizePortalAlerts(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const severity = String(item.severity || "").trim();
      if (!ATTENTION_SEVERITIES[severity]) continue;
      const title = String(item.title || "").trim();
      const message = String(item.message || "").trim();
      if (!title || !message) continue;
      out.push({
        severity,
        title,
        message,
      });
    }
    return out;
  }

  function severityMarkLabel(severity) {
    if (severity === "critical") return "Crítica";
    if (severity === "warning") return "Importante";
    return "Info";
  }

  /** Usa alerts_summary si es válido; si no, no inventa. */
  function formatAttentionBadges(summary, alertCount) {
    if (!summary || typeof summary !== "object") return "";
    const c = Number(summary.critical_count);
    const w = Number(summary.warning_count);
    const i = Number(summary.info_count);
    if (![c, w, i].every((n) => Number.isFinite(n) && n >= 0)) return "";
    if (alertCount === 0 && c === 0 && w === 0 && i === 0) return "";
    const parts = [];
    if (c > 0) parts.push(`${Math.floor(c)} crítica${c === 1 ? "" : "s"}`);
    if (w > 0) parts.push(`${Math.floor(w)} importante${w === 1 ? "" : "s"}`);
    if (i > 0) parts.push(`${Math.floor(i)} info`);
    return parts.join(" · ");
  }

  /**
   * Preview: todas las críticas + resto hasta ATTENTION_PREVIEW.
   * Nunca oculta críticas cuando hay colapso.
   */
  function alertsForDisplay(alerts, expanded) {
    if (expanded || alerts.length <= ATTENTION_PREVIEW) return alerts;
    const criticals = alerts.filter((a) => a.severity === "critical");
    const rest = alerts.filter((a) => a.severity !== "critical");
    const room = Math.max(0, ATTENTION_PREVIEW - criticals.length);
    return criticals.concat(rest.slice(0, room));
  }

  function renderAttention(data) {
    const listEl = document.getElementById("attention-list");
    const emptyEl = document.getElementById("attention-empty");
    const badgesEl = document.getElementById("attention-badges");
    const toggleEl = document.getElementById("attention-toggle");
    if (!listEl || !emptyEl || !badgesEl || !toggleEl) return;

    const alerts = normalizePortalAlerts(data && data.alerts);
    const badgeText = formatAttentionBadges(data && data.alerts_summary, alerts.length);

    if (badgeText) {
      badgesEl.hidden = false;
      badgesEl.textContent = badgeText;
    } else {
      badgesEl.hidden = true;
      badgesEl.textContent = "";
    }

    if (!alerts.length) {
      attentionExpanded = false;
      listEl.hidden = true;
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      toggleEl.hidden = true;
      return;
    }

    emptyEl.hidden = true;
    const visible = alertsForDisplay(alerts, attentionExpanded);
    const hiddenCount = alerts.length - visible.length;

    listEl.hidden = false;
    listEl.innerHTML = visible
      .map((a) => {
        const mark = severityMarkLabel(a.severity);
        return `<li class="attention-item attention-item--${escapeHtml(a.severity)}">
          <span class="attention-item__mark" aria-label="Severidad ${escapeHtml(mark)}">${escapeHtml(mark)}</span>
          <div class="attention-item__body min-w-0">
            <p class="attention-item__title">${escapeHtml(a.title)}</p>
            <p class="attention-item__msg">${escapeHtml(a.message)}</p>
          </div>
        </li>`;
      })
      .join("");

    if (hiddenCount > 0 || (attentionExpanded && alerts.length > ATTENTION_PREVIEW)) {
      toggleEl.hidden = false;
      toggleEl.textContent = attentionExpanded
        ? "Ver menos"
        : `Ver todas (${alerts.length})`;
      toggleEl.setAttribute("aria-expanded", attentionExpanded ? "true" : "false");
    } else {
      toggleEl.hidden = true;
    }
  }

  function renderDashboard(data) {
    lastDashboard = data;
    document.getElementById("biz-name").textContent = data.business_name || "Mi comercio";
    const syncEl = document.getElementById("sync-meta");

    if (data.empty) {
      syncEl.textContent = "Esperando primera subida desde la PC";
      setViewMode("empty");
      document.getElementById("empty-msg").textContent =
        data.message ||
        "En la PC del comercio: Configuración → Panel web del dueño → activá el interruptor. Los datos se actualizan desde la PC principal.";
      return;
    }

    setViewMode("dash");

    // Si el período elegido no tiene datos (snapshot viejo), volver a 7d o hoy.
    if (selectedPeriod === "30d" && !(Array.isArray(data.sales_last_30_days) && data.sales_last_30_days.length)) {
      selectedPeriod = "7d";
    }
    if (selectedPeriod === "month" && !(Array.isArray(data.sales_month_to_date) && data.sales_month_to_date.length)) {
      selectedPeriod = "7d";
    }

    const when = data.pushed_at || data.updated_at;
    const ago = relativeAgo(when);
    const health = snapshotHealth(ago.ageMs);
    const device = data.device_name ? ` · ${data.device_name}` : "";
    syncEl.textContent = `${ago.text}${device}`;

    const statusCard = document.getElementById("status-card");
    statusCard.className = `status-card ${health.cls}`;
    document.getElementById("status-title").textContent = health.title;
    document.getElementById("status-detail").textContent =
      `${ago.text}. Los datos se actualizan desde la PC principal.`;

    renderAttention(data);

    const todayTotal = data.sales_today_total ?? 0;
    const todayCount = data.sales_today_count ?? 0;
    const yesterdayTotal = data.sales_yesterday_total ?? 0;
    const delta = vsYesterday(todayTotal, yesterdayTotal);
    const ticketAvg = avgTicket(todayTotal, todayCount);
    const stockCount = data.low_stock_count ?? 0;

    document.getElementById("kpi-grid").innerHTML = `
      <article class="kpi kpi--primary">
        <p class="kpi-label">Ventas hoy</p>
        <p class="kpi-value">${escapeHtml(money(todayTotal))}</p>
        <p class="kpi-hint ${delta.cls}">${escapeHtml(delta.text)}</p>
        <p class="kpi-sub">Ayer ${escapeHtml(money(yesterdayTotal))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Tickets</p>
        <p class="kpi-value">${escapeHtml(String(todayCount))}</p>
        <p class="kpi-hint">Ticket promedio</p>
        <p class="kpi-sub kpi-sub--strong">${escapeHtml(money(ticketAvg))}</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Stock para revisar</p>
        <p class="kpi-value">${escapeHtml(String(stockCount))}</p>
        <p class="kpi-hint">Mínimo o stock negativo</p>
      </article>
      <article class="kpi">
        <p class="kpi-label">Actualización</p>
        <p class="kpi-value kpi-value--sm">${escapeHtml(ago.text.replace(/^Actualizado /, ""))}</p>
        <p class="kpi-hint">${escapeHtml(formatWhen(when))}</p>
      </article>`;

    const registers =
      rowsFromPeriodMap(data.sales_by_register_by_period, selectedPeriod) ??
      (selectedPeriod === "today" && Array.isArray(data.sales_by_register)
        ? data.sales_by_register
        : null);
    const regBox = document.getElementById("register-compare");
    const regHeading = document.getElementById("registers-heading");
    if (regHeading) {
      regHeading.textContent = `Por caja · ${periodTitleSuffix(selectedPeriod)}`;
    }
    if (registers == null) {
      regBox.innerHTML = `<div class="card register-empty"><p class="compare-meta">Datos no disponibles en esta actualización</p></div>`;
    } else if (!registers.length) {
      regBox.innerHTML = `<div class="card register-empty"><p class="compare-meta">Sin ventas con caja identificada en este período.</p></div>`;
    } else {
      regBox.innerHTML = registers
        .map((r) => {
          const label = r.name?.trim() || registerLabel(r);
          const count = Number(r.count) || 0;
          const total = Number(r.total) || 0;
          const avg = avgTicket(total, count);
          return `<article class="register-card card">
            <p class="register-card__name">${escapeHtml(label)}</p>
            <p class="register-card__total">${escapeHtml(money(total))}</p>
            <p class="register-card__meta">${escapeHtml(String(count))} ticket${count === 1 ? "" : "s"}</p>
            <p class="register-card__avg">Ticket promedio ${escapeHtml(money(avg))}</p>
          </article>`;
        })
        .join("");
    }

    renderSalesPeriod(data);

    const paymentRows = rowsFromPeriodMap(data.sales_by_payment, selectedPeriod);
    const payUl = document.getElementById("payment-list");
    if (paymentRows == null) {
      renderEmptyList(
        payUl,
        "Datos no disponibles",
        "Datos no disponibles en esta actualización",
      );
    } else if (!paymentRows.length) {
      renderEmptyList(payUl, "Sin cobros", "No hay ventas en este período");
    } else {
      payUl.innerHTML = paymentRows
        .map((p) => {
          const label = paymentLabel(p.method);
          const count = Number(p.count) || 0;
          return `<li>
            <div class="left">
              <strong>${escapeHtml(label)}</strong>
              <span>${escapeHtml(String(count))} ticket${count === 1 ? "" : "s"}</span>
            </div>
            <div class="right">${escapeHtml(money(p.total))}</div>
          </li>`;
        })
        .join("");
    }

    const employees =
      rowsFromPeriodMap(data.sales_by_employee_by_period, selectedPeriod) ??
      (selectedPeriod === "today" && Array.isArray(data.sales_by_employee)
        ? data.sales_by_employee
        : null);
    const empUl = document.getElementById("employee-list");
    const empHeading = document.getElementById("employees-heading");
    if (empHeading) {
      empHeading.textContent = `Por empleado · ${periodTitleSuffix(selectedPeriod)}`;
    }
    if (employees == null) {
      renderEmptyList(
        empUl,
        "Datos no disponibles",
        "Datos no disponibles en esta actualización",
      );
    } else if (!employees.length) {
      renderEmptyList(empUl, "Sin ventas por empleado", "Aparece cuando hay tickets con cajero");
    } else {
      empUl.innerHTML = employees
        .map((e) => {
          const count = Number(e.count) || 0;
          const total = Number(e.total) || 0;
          const avg = avgTicket(total, count);
          return `<li>
            <div class="left">
              <strong>${escapeHtml(e.name || "Sin asignar")}</strong>
              <span>${escapeHtml(String(count))} ticket${count === 1 ? "" : "s"} · prom. ${escapeHtml(money(avg))}</span>
            </div>
            <div class="right">${escapeHtml(money(total))}</div>
          </li>`;
        })
        .join("");
    }

    const stockSummaryEl = document.getElementById("stock-summary");
    const summary = data.stock_summary;
    const productsTotal = Number(summary?.products_total ?? data.products_total) || 0;
    const critical = Number(summary?.critical_count) || 0;
    const lowOnly = Number(summary?.low_count) || 0;
    if (summary && (critical > 0 || lowOnly > 0 || productsTotal > 0)) {
      stockSummaryEl.hidden = false;
      const normal =
        productsTotal > 0 ? Math.max(0, productsTotal - critical - lowOnly) : null;
      stockSummaryEl.innerHTML = `
        <div class="stock-pill stock-pill--critical"><span>Crítico</span><strong>${critical}</strong></div>
        <div class="stock-pill stock-pill--low"><span>Bajo</span><strong>${lowOnly}</strong></div>
        ${
          normal != null
            ? `<div class="stock-pill stock-pill--ok"><span>Normal</span><strong>${normal}</strong></div>`
            : ""
        }`;
    } else {
      stockSummaryEl.hidden = true;
      stockSummaryEl.innerHTML = "";
    }

    const stockUl = document.getElementById("stock-list");
    const low = Array.isArray(data.low_stock) ? data.low_stock : [];
    const totalAlerts = data.low_stock_count ?? low.length;
    const more =
      totalAlerts > low.length
        ? `<li class="list-more"><span>+ ${totalAlerts - low.length} más en la PC</span></li>`
        : "";
    if (!low.length) {
      renderEmptyList(stockUl, "Sin alertas", "Nada urgente para pedir");
    } else {
      stockUl.innerHTML =
        low
          .map((p) => {
            const cls = stockClass(p.stock, p.min_stock);
            const minLabel =
              Number(p.min_stock) > 0 ? `Mín. ${p.min_stock}` : "Stock negativo";
            const cover =
              typeof p.estimated_days_cover === "number" && Number.isFinite(p.estimated_days_cover)
                ? ` · ${p.estimated_days_cover < 10 ? p.estimated_days_cover.toFixed(1) : Math.round(p.estimated_days_cover)} días est.`
                : "";
            return `<li class="${cls}">
              <div class="left">
                <strong>${escapeHtml(p.name || "?")}</strong>
                <span>${escapeHtml(minLabel)}${escapeHtml(cover)}</span>
              </div>
              <div class="right">${escapeHtml(String(p.stock ?? 0))}</div>
            </li>`;
          })
          .join("") + more;
    }

    const topHeading = document.getElementById("top-heading");
    if (topHeading) {
      topHeading.textContent = `Top productos · ${periodTitleSuffix(selectedPeriod)}`;
    }
    const topUl = document.getElementById("top-list");
    const topFromMap = rowsFromPeriodMap(data.top_products, selectedPeriod);
    let top = topFromMap;
    if (top == null && selectedPeriod === "today" && Array.isArray(data.top_products_today)) {
      top = data.top_products_today.map((p) => ({
        name: p.name,
        qty: p.qty,
        total: null,
      }));
    }
    if (top == null) {
      renderEmptyList(
        topUl,
        "Datos no disponibles",
        "Datos no disponibles en esta actualización",
      );
    } else if (!top.length) {
      renderEmptyList(topUl, "Sin ventas de productos", "Cuando haya tickets aparece el ranking");
    } else {
      topUl.innerHTML = top
        .map((p) => {
          const qty = Math.round(Number(p.qty) || 0);
          const hasTotal = p.total != null && Number.isFinite(Number(p.total));
          const sub = hasTotal
            ? `${qty} unidad${qty === 1 ? "" : "es"}`
            : `${qty} u.`;
          const right = hasTotal ? money(p.total) : `${qty} u.`;
          return `<li>
            <div class="left">
              <strong>${escapeHtml(p.name || "?")}</strong>
              <span>${escapeHtml(sub)}</span>
            </div>
            <div class="right">${escapeHtml(right)}</div>
          </li>`;
        })
        .join("");
    }

    const salesUl = document.getElementById("sales-list");
    const sales = Array.isArray(data.recent_sales) ? data.recent_sales : [];
    if (!sales.length) {
      renderEmptyList(salesUl, "Sin ventas recientes", "Hoy todavía no hubo tickets");
    } else {
      salesUl.innerHTML = sales
        .map((s) => {
          const pay = paymentLabel(s.payment_method);
          const meta = [s.device || "Caja", s.seller, pay].filter(Boolean).join(" · ");
          return `<li>
            <div class="left">
              <strong>${escapeHtml(formatWhen(s.at))}</strong>
              <span>${escapeHtml(meta)}</span>
            </div>
            <div class="right">${escapeHtml(money(s.total))}</div>
          </li>`;
        })
        .join("");
    }

    renderIntelligence();
  }

  async function loadDashboard({ silent } = {}) {
    if (!silent) {
      btnRefresh.classList.add("is-loading");
      if (dashBody.hidden && emptyState.hidden) setViewMode("loading");
    }
    try {
      const data = await api("/v1/portal/dashboard");
      renderDashboard(data);
      errorState.hidden = true;
    } catch (err) {
      if (err.status === 401) {
        setToken("");
        showLogin();
        return;
      }
      if (!silent || dashBody.hidden) {
        setViewMode("error");
        document.getElementById("error-msg").textContent =
          err.message || "No se pudo conectar. Revisá internet e intentá de nuevo.";
      }
    } finally {
      if (!silent) btnRefresh.classList.remove("is-loading");
    }
  }

  async function boot() {
    if (!getToken()) {
      showLogin();
      return;
    }
    try {
      const me = await api("/v1/portal/me");
      portalAccountKey = String(me.email || me.name || "").trim().toLowerCase();
      showDash();
      setViewMode("loading");
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
      portalAccountKey = String(data.email || data.name || document.getElementById("email").value || "")
        .trim()
        .toLowerCase();
      showDash();
      setViewMode("loading");
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

  async function refreshClick() {
    btnRefresh.disabled = true;
    try {
      await loadDashboard();
    } finally {
      btnRefresh.disabled = false;
    }
  }

  btnRefresh.addEventListener("click", () => void refreshClick());
  btnRetry.addEventListener("click", () => void refreshClick());

  document.getElementById("period-tabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".period-tab");
    if (!btn || btn.disabled) return;
    const period = btn.getAttribute("data-period");
    if (!period || period === selectedPeriod) return;
    selectedPeriod = period;
    if (lastDashboard && !lastDashboard.empty) {
      renderDashboard(lastDashboard);
    }
  });

  document.getElementById("attention-toggle")?.addEventListener("click", () => {
    attentionExpanded = !attentionExpanded;
    if (lastDashboard && !lastDashboard.empty) {
      renderAttention(lastDashboard);
    }
  });

  document.getElementById("btn-intelligence")?.addEventListener("click", () => {
    void runIntelligence({ force: true });
  });
  document.getElementById("btn-intelligence-retry")?.addEventListener("click", () => {
    void runIntelligence({ force: true });
  });

  /** Helpers F4D para tests unitarios (solo presentación). */
  window.__WALQO_PORTAL_ATTENTION__ = {
    normalizePortalAlerts,
    formatAttentionBadges,
    alertsForDisplay,
    severityMarkLabel,
    ATTENTION_PREVIEW,
  };

  /** Helpers F4E-4 Inteligencia WalQo (UI; no llama backend en tests). */
  window.__WALQO_PORTAL_IA__ = {
    periodMapKey,
    periodTitleSuffix,
    intelligenceErrorMessage,
    ctaLabelForStatus,
    fillTextList,
    getSelectedPeriod: () => selectedPeriod,
    getIaUi: () => ({ ...iaUi }),
    setIaUiForTests: (next) => {
      iaUi = { ...iaUi, ...next };
    },
    setLastDashboardForTests: (data) => {
      lastDashboard = data;
    },
    setPortalAccountKeyForTests: (k) => {
      portalAccountKey = String(k || "");
    },
    renderIntelligence,
    runIntelligence,
    iaCacheStorageKey,
    readIaCache,
    writeIaCache,
    clearIaSessionCacheAll,
    isInflight: () => iaInflight,
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getToken() && !viewDash.hidden) {
      void loadDashboard({ silent: true });
    }
  });

  void boot();
})();
