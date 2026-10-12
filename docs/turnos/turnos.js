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
  const progress = document.getElementById("progress");
  const stepTitle = document.getElementById("stepTitle");
  const stepHint = document.getElementById("stepHint");
  const stepBody = document.getElementById("stepBody");
  const backBtn = document.getElementById("back");
  const nextBtn = document.getElementById("next");

  let shop = null;
  let serviceId = "";
  let resourceId = 0;
  let date = "";
  let startsAt = "";
  let customerName = "";
  let customerPhone = "";
  let step = 0;
  let viewMonth = "";
  let sending = false;
  let loading = false;
  let fieldError = "";

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function money(n) {
    const v = Number(n) || 0;
    if (v <= 0) return "";
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

  function monthName(ym) {
    const [y, m] = String(ym).split("-").map(Number);
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return (months[(m || 1) - 1] || "") + " " + y;
  }

  function shiftMonth(ym, delta) {
    const [y, m] = String(ym).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1 + delta, 1);
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1);
  }

  function daysInMonth(ym) {
    const [y, m] = String(ym).split("-").map(Number);
    return new Date(y, m, 0).getDate();
  }

  function mondayIndex(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return (new Date(y, (m || 1) - 1, d || 1).getDay() + 6) % 7;
  }

  function personWord() {
    return shop && shop.rubro === "taller" ? "Mecánico" : "Profesional";
  }

  function flow() {
    const steps = [{ id: "service", title: "Elegí el servicio" }];
    if ((shop?.resources || []).length) {
      steps.push({ id: "resource", title: "Elegí " + personWord().toLowerCase() });
    }
    steps.push(
      { id: "when", title: "Elegí día y horario" },
      { id: "data", title: "Tus datos" },
      { id: "review", title: "Revisá el turno" },
    );
    return steps;
  }

  function current() {
    const steps = flow();
    if (step > steps.length - 1) step = steps.length - 1;
    if (step < 0) step = 0;
    return steps[step];
  }

  function selectedService() {
    return (shop?.services || []).find((item) => item.sync_id === serviceId) || null;
  }

  function selectedResource() {
    return (shop?.resources || []).find((item) => item.id === resourceId) || null;
  }

  function serviceMeta(item) {
    const bits = [];
    if (shop?.duration_min) bits.push(shop.duration_min + " min");
    const price = money(item.price);
    if (price) bits.push(price);
    return bits.join(" · ");
  }

  function hoursText() {
    const hours = shop?.hours || {};
    const names = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
    const days = (hours.days || [])
      .slice()
      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
      .map((day) => names[day])
      .filter(Boolean);
    const shifts = Array.isArray(hours.shifts) && hours.shifts.length
      ? hours.shifts
      : [{ open: hours.open || "09:00", close: hours.close || "19:00" }];
    const ranges = shifts
      .filter((shift) => shift && shift.open && shift.close)
      .map((shift) => "de " + shift.open + " a " + shift.close)
      .join(" y ");
    if (hours.source === "default") {
      return "El local todavía no publicó días propios. Por ahora se puede reservar todos los días, " + ranges + ".";
    }
    if (!days.length) return "El local no publicó días de atención.";
    return "Atiende los " + days.join(", ") + ", " + ranges + ".";
  }

  function missingCopy() {
    if (!(shop?.services || []).length) {
      return "Este local todavía no publicó servicios. En WalQo, cada servicio tiene que tener unidad Servicio, Práctica o Sesión, y un precio. Con la computadora abierta, sincronizá la app del celular y volvé a abrir este enlace.";
    }
    if (!(shop?.resources || []).length) {
      return "Este local todavía no cargó " + (shop && shop.rubro === "taller" ? "mecánicos" : "profesionales") + " en la agenda. En WalQo, cargalos en Turnos y sincronizá con la computadora abierta. Sin eso no se puede reservar.";
    }
    return "";
  }

  function paintProgress() {
    const steps = flow();
    progress.innerHTML = steps
      .map((_, index) => '<span class="' + (index < step ? "done" : index === step ? "on" : "") + '"></span>')
      .join("");
  }

  function buttonList(items, selected, onPick) {
    if (!items.length) {
      stepBody.innerHTML = '<p class="note">Todavía no hay opciones.</p>';
      return;
    }
    stepBody.innerHTML = items
      .map(
        (item) =>
          '<button type="button" class="pick' +
          (item.key === selected ? " on" : "") +
          '" data-key="' +
          esc(item.key) +
          '"><strong>' +
          esc(item.title) +
          "</strong>" +
          (item.meta ? "<small>" + esc(item.meta) + "</small>" : "") +
          "</button>",
      )
      .join("");
    stepBody.querySelectorAll("button").forEach((button) => {
      button.onclick = () => onPick(button.getAttribute("data-key") || "");
    });
  }

  function paintCalendar() {
    const today = shop?.today || "";
    const horizon = shop?.horizon || "";
    if (!viewMonth) viewMonth = String(date || today).slice(0, 7);
    const open = new Set(shop?.open_dates || []);
    const total = daysInMonth(viewMonth);
    const lead = mondayIndex(viewMonth + "-01");
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push('<span class="pad"></span>');
    for (let day = 1; day <= total; day += 1) {
      const iso = viewMonth + "-" + pad(day);
      const available = open.has(iso);
      cells.push(
        '<button type="button" data-date="' +
          iso +
          '" class="' +
          (iso === date ? "on" : available ? "open" : "") +
          '"' +
          (available ? "" : " disabled") +
          ">" +
          day +
          "</button>",
      );
    }
    const minMonth = String(today).slice(0, 7);
    const maxMonth = String(horizon).slice(0, 7);
    const slots = date && date.slice(0, 7) === viewMonth ? shop?.slots || [] : [];
    stepBody.innerHTML =
      '<div class="cal-head"><button type="button" id="prevMonth"' +
      (viewMonth <= minMonth ? " disabled" : "") +
      '>‹</button><strong>' +
      esc(monthName(viewMonth)) +
      '</strong><button type="button" id="nextMonth"' +
      (viewMonth >= maxMonth ? " disabled" : "") +
      '>›</button></div><div class="weekdays"><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="month">' +
      cells.join("") +
      '</div><div class="slots" id="slots"></div>';
    const slotBox = document.getElementById("slots");
    if (!date) {
      slotBox.innerHTML = '<p class="note">Elegí un día con horario libre.</p>';
    } else if (!slots.length) {
      slotBox.innerHTML = '<p class="note">Ese día no tiene horarios libres.</p>';
    } else {
      slotBox.innerHTML = slots
        .map((slot) => {
          const hour = String(slot.starts_at).slice(11, 16);
          return (
            '<button type="button" class="slot' +
            (slot.starts_at === startsAt ? " on" : "") +
            '" data-slot="' +
            esc(slot.starts_at) +
            '">' +
            esc(hour) +
            "</button>"
          );
        })
        .join("");
    }
    const prev = document.getElementById("prevMonth");
    const next = document.getElementById("nextMonth");
    if (prev) prev.onclick = () => { viewMonth = shiftMonth(viewMonth, -1); paint(); };
    if (next) next.onclick = () => { viewMonth = shiftMonth(viewMonth, 1); paint(); };
    stepBody.querySelectorAll("[data-date]").forEach((button) => {
      button.onclick = () => {
        date = button.getAttribute("data-date") || "";
        startsAt = "";
        loadAgenda().catch((error) => showError(error.message));
      };
    });
    slotBox.querySelectorAll("[data-slot]").forEach((button) => {
      button.onclick = () => {
        startsAt = button.getAttribute("data-slot") || "";
        fieldError = "";
        paint();
      };
    });
  }

  function paintData() {
    stepBody.innerHTML =
      '<label for="name">Nombre</label><input id="name" autocomplete="name" maxlength="80" value="' +
      esc(customerName) +
      '" /><label for="phone">Teléfono</label><input id="phone" autocomplete="tel" inputmode="tel" maxlength="40" value="' +
      esc(customerPhone) +
      '" />';
    const name = document.getElementById("name");
    const phone = document.getElementById("phone");
    if (fieldError === "name") name.classList.add("bad");
    if (fieldError === "phone") phone.classList.add("bad");
    name.oninput = () => { customerName = name.value; };
    phone.oninput = () => { customerPhone = phone.value; };
  }

  function paintReview() {
    const service = selectedService();
    const resource = selectedResource();
    const price = service ? money(service.price) : "";
    stepBody.innerHTML =
      '<div class="summary"><p><strong>Servicio</strong>' +
      esc(service ? service.name : "Sin servicio") +
      (shop?.duration_min ? "<small>" + esc(shop.duration_min + " min") + "</small>" : "") +
      "</p><p><strong>" +
      esc(personWord()) +
      "</strong>" +
      esc(resource ? resource.name : "Sin profesional") +
      "</p><p><strong>Cuándo</strong>" +
      esc(date ? labelDate(date) : "Sin fecha") +
      (startsAt ? " · " + esc(String(startsAt).slice(11, 16)) : "") +
      "</p>" +
      (price ? "<p><strong>Precio</strong>" + esc(price) + "<small>Se paga en el local.</small></p>" : "<p><strong>Pago</strong>En el local.</p>") +
      "<p><strong>A nombre de</strong>" +
      esc(customerName || "Sin nombre") +
      "<small>" +
      esc(customerPhone || "Sin teléfono") +
      "</small></p></div>";
  }

  function paint() {
    if (!shop) return;
    biz.textContent = shop.business_name || "El local";
    const gap = missingCopy();
    if (gap) {
      app.hidden = true;
      statusEl.hidden = false;
      statusEl.textContent = gap;
      return;
    }
    statusEl.hidden = true;
    app.hidden = false;
    const item = current();
    paintProgress();
    stepTitle.textContent = item.title;
    formErr.textContent = "";
    backBtn.hidden = step === 0;
    nextBtn.textContent = item.id === "review" ? "Confirmar turno" : "Seguir";
    nextBtn.disabled = sending || loading;
    if (item.id === "service") {
      stepHint.textContent = "Elegí uno. El pago es en el local.";
      buttonList(
        (shop.services || []).map((service) => ({
          key: service.sync_id,
          title: service.name,
          meta: serviceMeta(service),
        })),
        serviceId,
        (key) => { serviceId = key; fieldError = ""; paint(); },
      );
    } else if (item.id === "resource") {
      stepHint.textContent = "El horario libre depende de quién te atiende.";
      buttonList(
        (shop.resources || []).map((resource) => ({ key: String(resource.id), title: resource.name, meta: "" })),
        String(resourceId || ""),
        (key) => {
          resourceId = Number(key) || 0;
          startsAt = "";
          date = "";
          fieldError = "";
          loadAgenda().catch((error) => showError(error.message));
        },
      );
    } else if (item.id === "when") {
      stepHint.textContent = hoursText();
      paintCalendar();
    } else if (item.id === "data") {
      stepHint.textContent = "Solo hace falta tu nombre y un teléfono para confirmar el turno.";
      paintData();
    } else {
      stepHint.textContent = "Si está bien, confirmá. El turno se guarda recién cuando el servidor lo acepta.";
      paintReview();
    }
  }

  function showError(message) {
    formErr.textContent = message || "No se pudo completar.";
  }

  function validateStep() {
    const item = current();
    fieldError = "";
    if (item.id === "service" && !serviceId) return "Elegí un servicio.";
    if (item.id === "resource" && !resourceId) return "Elegí un " + personWord().toLowerCase() + ".";
    if (item.id === "when" && !startsAt) return "Elegí un día y un horario libre.";
    if (item.id === "data") {
      if (customerName.trim().length < 2) {
        fieldError = "name";
        return "Escribí tu nombre, al menos dos letras.";
      }
      if (customerPhone.replace(/\D/g, "").length < 8) {
        fieldError = "phone";
        return "Escribí un teléfono con código de área, al menos 8 números.";
      }
    }
    return "";
  }

  async function loadAgenda() {
    loading = true;
    nextBtn.disabled = true;
    try {
      const url =
        API +
        "/v1/public/turnos?t=" +
        encodeURIComponent(code) +
        "&date=" +
        encodeURIComponent(date || "") +
        "&resource=" +
        encodeURIComponent(String(resourceId || ""));
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo cargar la agenda.");
      shop = data;
      if (date && !(data.open_dates || []).includes(date)) {
        date = "";
        startsAt = "";
      }
      if (startsAt && !(data.slots || []).some((slot) => slot.starts_at === startsAt)) startsAt = "";
      if (!viewMonth) viewMonth = String(data.today || "").slice(0, 7);
    } finally {
      loading = false;
    }
    paint();
  }

  async function confirmBooking() {
    if (sending) return;
    sending = true;
    paint();
    try {
      const res = await fetch(API + "/v1/public/turnos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          t: code,
          service_sync_id: serviceId,
          resource_id: resourceId,
          starts_at: startsAt,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
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
      const message = error.message || "No se pudo reservar.";
      startsAt = "";
      const when = flow().findIndex((item) => item.id === "when");
      if (when >= 0) step = when;
      await loadAgenda().catch(() => {});
      showError(message);
    } finally {
      sending = false;
      if (done.hidden) nextBtn.disabled = false;
    }
  }

  backBtn.onclick = () => {
    if (sending || step === 0) return;
    step -= 1;
    formErr.textContent = "";
    paint();
  };

  nextBtn.onclick = () => {
    if (sending || loading) return;
    const problem = validateStep();
    if (problem) {
      paint();
      showError(problem);
      return;
    }
    const item = current();
    if (item.id === "review") {
      confirmBooking();
      return;
    }
    step += 1;
    paint();
  };

  document.getElementById("again").onclick = () => {
    done.hidden = true;
    startsAt = "";
    customerName = "";
    customerPhone = "";
    step = 0;
    sending = false;
    loadAgenda().catch((error) => {
      app.hidden = true;
      statusEl.hidden = false;
      statusEl.textContent = error.message || "No se pudo cargar la agenda.";
    });
  };

  async function boot() {
    if (!code) {
      statusEl.textContent = "Falta el código del local. Pedile el enlace a quien te atiende.";
      return;
    }
    try {
      await loadAgenda();
    } catch (error) {
      statusEl.textContent = error.message || "No se pudo cargar la agenda.";
    }
  }

  boot();
})();
