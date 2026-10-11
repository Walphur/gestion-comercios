(() => {
  const API = "https://gestion-catalogo-movil.walphur.workers.dev";
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("t") || "").trim();
  const biz = document.getElementById("biz");
  const statusEl = document.getElementById("status");
  const app = document.getElementById("app");
  const done = document.getElementById("done");
  const doneText = document.getElementById("doneText");
  const formErr = document.getElementById("formErr");

  let shop = null;
  let serviceId = "";
  let resourceId = 0;
  let date = "";
  let startsAt = "";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    const v = Number(n) || 0;
    try {
      return "$ " + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(v);
    } catch {
      return "$ " + Math.round(v);
    }
  }

  function labelDate(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return days[dt.getDay()] + " " + dt.getDate() + " " + months[dt.getMonth()];
  }

  function addDays(iso, days) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + days);
    const pad = (n) => String(n).padStart(2, "0");
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
  }

  function buttons(el, items, selected, onPick) {
    el.innerHTML = "";
    if (!items.length) {
      el.innerHTML = '<p class="note">Todavía no hay opciones.</p>';
      return;
    }
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = item.html;
      if (item.key === selected) btn.className = "on";
      btn.onclick = () => onPick(item.key);
      el.appendChild(btn);
    });
  }

  function paint() {
    if (!shop) return;
    biz.textContent = shop.business_name || "El local";
    buttons(
      document.getElementById("services"),
      (shop.services || []).map((item) => ({
        key: item.sync_id,
        html: esc(item.name) + "<small>" + esc(money(item.price)) + "</small>",
      })),
      serviceId,
      (key) => {
        serviceId = key;
        paint();
      },
    );
    buttons(
      document.getElementById("resources"),
      (shop.resources || []).map((item) => ({
        key: String(item.id),
        html: esc(item.name),
      })),
      String(resourceId || ""),
      (key) => {
        resourceId = Number(key) || 0;
        startsAt = "";
        loadDay();
      },
    );
    const days = [];
    let cursor = shop.today;
    while (cursor && shop.horizon && cursor <= shop.horizon && days.length < 21) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    buttons(
      document.getElementById("days"),
      days.map((day) => ({ key: day, html: esc(labelDate(day)) })),
      date,
      (key) => {
        date = key;
        startsAt = "";
        loadDay();
      },
    );
    const slotBox = document.getElementById("slots");
    if (!resourceId) {
      slotBox.innerHTML = '<p class="note">Elegí un profesional para ver los horarios.</p>';
    } else {
      buttons(
        slotBox,
        (shop.slots || []).map((slot) => ({
          key: slot.starts_at,
          html: esc(String(slot.starts_at).slice(11, 16)),
        })),
        startsAt,
        (key) => {
          startsAt = key;
          paint();
        },
      );
    }
    if (!(shop.services || []).length) {
      statusEl.hidden = false;
      statusEl.textContent =
        "El local todavía no publicó servicios. En la compu, cada servicio tiene que estar como unidad Servicio y con precio.";
    } else if (!(shop.resources || []).length) {
      statusEl.hidden = false;
      statusEl.textContent =
        "El local todavía no cargó profesionales en la agenda. Cuando WalQo esté abierto, aparecen acá.";
    } else if (resourceId && !(shop.slots || []).length) {
      statusEl.hidden = false;
      statusEl.textContent = "No quedan horarios libres ese día.";
    } else {
      statusEl.hidden = true;
    }
  }

  async function loadDay() {
    formErr.textContent = "";
    statusEl.hidden = false;
    statusEl.textContent = "Buscando horarios…";
    const url =
      API +
      "/v1/public/turnos?t=" +
      encodeURIComponent(code) +
      "&date=" +
      encodeURIComponent(date) +
      "&resource=" +
      encodeURIComponent(String(resourceId || ""));
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo cargar la agenda.");
    shop = data;
    if (!date) date = data.date || data.today;
    paint();
  }

  async function boot() {
    if (!code) {
      statusEl.textContent = "Falta el código del local. Pedile el enlace a quien te atiende.";
      return;
    }
    try {
      await loadDay();
      app.hidden = false;
    } catch (error) {
      statusEl.textContent = error.message || "No se pudo cargar la agenda.";
    }
  }

  document.getElementById("confirm").onclick = async () => {
    formErr.textContent = "";
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    if (!serviceId) {
      formErr.textContent = "Elegí un servicio.";
      return;
    }
    if (!resourceId) {
      formErr.textContent = "Elegí un profesional.";
      return;
    }
    if (!startsAt) {
      formErr.textContent = "Elegí un horario libre.";
      return;
    }
    if (name.length < 2) {
      formErr.textContent = "Dejá tu nombre.";
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      formErr.textContent = "Dejá un teléfono válido.";
      return;
    }
    const button = document.getElementById("confirm");
    button.disabled = true;
    try {
      const res = await fetch(API + "/v1/public/turnos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          t: code,
          service_sync_id: serviceId,
          resource_id: resourceId,
          starts_at: startsAt,
          customer_name: name,
          customer_phone: phone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo reservar.");
      app.hidden = true;
      statusEl.hidden = true;
      done.hidden = false;
      doneText.textContent =
        data.service_name +
        " con " +
        data.resource_name +
        ", el " +
        labelDate(String(data.starts_at).slice(0, 10)) +
        " a las " +
        String(data.starts_at).slice(11, 16) +
        ". Quedó en estado Programado a nombre de " +
        data.customer_name +
        ".";
    } catch (error) {
      formErr.textContent = error.message || "No se pudo reservar.";
      await loadDay().catch(() => {});
    } finally {
      button.disabled = false;
    }
  };

  document.getElementById("again").onclick = () => {
    done.hidden = true;
    app.hidden = false;
    startsAt = "";
    document.getElementById("name").value = "";
    document.getElementById("phone").value = "";
    loadDay().catch((error) => {
      statusEl.hidden = false;
      statusEl.textContent = error.message || "No se pudo cargar la agenda.";
    });
  };

  boot();
})();
