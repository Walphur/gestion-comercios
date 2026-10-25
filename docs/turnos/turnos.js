(() => {
  const API = "https://gestion-catalogo-movil.walphur.workers.dev";
  const RESERVED = {
    turnos: 1, carta: 1, app: 1, taller: 1, legal: 1, tools: 1, marketing: 1, oauth: 1,
    assets: 1, branding: 1, guias: 1, precios: 1, celular: 1, funciones: 1, recursos: 1, walqo: 1,
  };
  function bookingRef() {
    const params = new URLSearchParams(window.location.search);
    const query = (params.get("t") || params.get("s") || "").trim();
    if (query) return query;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length === 1 && !RESERVED[parts[0].toLowerCase()] && parts[0].indexOf(".") < 0) {
      return decodeURIComponent(parts[0]);
    }
    return "";
  }
  const code = bookingRef();
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
  let anyResource = false;
  let chosenResourceId = 0;
  let serviceQuery = "";
  let focusSearch = false;
  let lastBooking = null;
  let customerName = "";
  let customerPhone = "";
  const profile = {
    document: "",
    email: "",
    birth: "",
    gender: "",
    insurance: "",
    affiliate: "",
    reason: "",
    kind: "",
    brand: "",
    model: "",
    year: "",
    plate: "",
    km: "",
    vehicleNotes: "",
  };
  let step = 0;
  let paintedStep = -1;
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

  function labelDateLong(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return days[dt.getDay()] + " " + dt.getDate() + " de " + months[dt.getMonth()];
  }

  function sumBlock(label, value, extra, hot) {
    return (
      '<section class="sum' +
      (hot ? " hot" : "") +
      '"><p class="sum-k">' +
      esc(label) +
      '</p><p class="sum-v">' +
      esc(value) +
      "</p>" +
      (extra ? '<p class="sum-x">' + esc(extra) + "</p>" : "") +
      "</section>"
    );
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
    const id = anyResource ? chosenResourceId : resourceId;
    return (shop?.resources || []).find((item) => item.id === id) || null;
  }

  function initial(name) {
    const letter = String(name || "?").trim().charAt(0).toUpperCase();
    return letter || "?";
  }

  function serviceMinutes(item) {
    const own = Number(item && item.duration_min) || 0;
    if (own >= 5) return own;
    return Number(shop?.duration_min) || 0;
  }

  function offeredResources() {
    const service = selectedService();
    const ids = service && Array.isArray(service.resource_ids) ? service.resource_ids : [];
    const all = shop?.resources || [];
    if (!ids.length) return all;
    return all.filter((item) => ids.indexOf(item.id) >= 0);
  }

  function serviceMeta(item) {
    const bits = [];
    const mins = serviceMinutes(item);
    if (mins) bits.push(mins + " min");
    const price = money(item.price);
    if (price) bits.push(price);
    return bits.join(" · ");
  }

  function shiftRange(shifts) {
    return (shifts || [])
      .filter((shift) => shift && shift.open && shift.close)
      .map((shift) => "de " + shift.open + " a " + shift.close)
      .join(" y ");
  }

  function hoursText() {
    const hours = shop?.hours || {};
    const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const days = (hours.days || [])
      .slice()
      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    const shifts = Array.isArray(hours.shifts) && hours.shifts.length
      ? hours.shifts
      : [{ open: hours.open || "09:00", close: hours.close || "19:00" }];
    const ranges = shiftRange(shifts);
    if (hours.source === "default") {
      return "El local todavía no publicó días propios. Por ahora se puede reservar todos los días, " + ranges + ".";
    }
    if (!days.length) return "El local no publicó días de atención.";
    const byDay = hours.byDay || {};
    const extras = [];
    days.forEach((day) => {
      const own = byDay[day] || byDay[String(day)];
      if (!own || !own.length) return;
      extras.push("el " + names[day] + " " + shiftRange(own));
    });
    const dayNames = days
      .map((day) => names[day])
      .filter(Boolean)
      .map((name) => (name.endsWith("s") ? name : name + "s"));
    const dayList = dayNames.length > 1
      ? dayNames.slice(0, -1).join(", ") + " y " + dayNames[dayNames.length - 1]
      : dayNames.join("");
    const mins = serviceMinutes(selectedService());
    const length = mins ? " Este servicio dura " + mins + " min." : "";
    const extrasText = extras.join("; ");
    const special = extrasText ? " " + extrasText.charAt(0).toUpperCase() + extrasText.slice(1) + "." : "";
    return "Atiende los " + dayList + ", " + ranges + "." + special + length;
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
    const names = ["Servicio", personWord(), "Horario", "Datos", "Resumen"];
    const steps = flow();
    progress.innerHTML =
      '<ol class="steps">' +
      steps
        .map((item, index) => {
          const state = index < step ? "done" : index === step ? "on" : "";
          const mark = index < step ? "✓" : String(index + 1);
          return (
            '<li class="' +
            state +
            '"><span>' +
            mark +
            "</span><em>" +
            esc(item.id === "resource" ? personWord() : names[index] || item.title) +
            "</em></li>"
          );
        })
        .join("") +
      "</ol>";
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
      '<div class="when"><div class="calendar"><div class="cal-head"><button type="button" id="prevMonth" aria-label="Mes anterior"' +
      (viewMonth <= minMonth ? " disabled" : "") +
      '>‹</button><strong>' +
      esc(monthName(viewMonth)) +
      '</strong><button type="button" id="nextMonth" aria-label="Mes siguiente"' +
      (viewMonth >= maxMonth ? " disabled" : "") +
      '>›</button></div><div class="weekdays"><span>LUN</span><span>MAR</span><span>MIÉ</span><span>JUE</span><span>VIE</span><span>SÁB</span><span>DOM</span></div><div class="month">' +
      cells.join("") +
      '</div></div><div class="slots-col"><p class="day-label">' +
      esc(date ? labelDateLong(date) : "Elegí un día disponible") +
      '</p><div class="slots" id="slots"></div></div></div>';
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
            '" data-resource="' +
            esc(slot.resource_id || resourceId || "") +
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
        chosenResourceId = Number(button.getAttribute("data-resource")) || resourceId || 0;
        fieldError = "";
        paint();
      };
    });
  }

  function rubro() {
    return String((shop && shop.rubro) || "");
  }

  function inputField(id, label, value, attrs) {
    return (
      '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + attrs +
      ' value="' + esc(value) + '" /><p class="field-err" id="' + id + 'Err"></p></div>'
    );
  }

  function selectField(id, label, value, options) {
    const choices = options
      .map((option) => '<option value="' + esc(option.value) + '"' + (option.value === value ? " selected" : "") + ">" + esc(option.label) + "</option>")
      .join("");
    return (
      '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' +
      choices + '</select><p class="field-err" id="' + id + 'Err"></p></div>'
    );
  }

  function yearOptions() {
    const max = new Date().getFullYear() + 1;
    const options = [{ value: "", label: "Elegí el año" }];
    for (let year = max; year >= 1960; year -= 1) options.push({ value: String(year), label: String(year) });
    return options;
  }

  function bindField(id, assign) {
    const node = document.getElementById(id);
    if (!node) return;
    const write = () => {
      assign(node.value);
      node.classList.remove("bad");
      const err = document.getElementById(id + "Err");
      if (err) err.textContent = "";
    };
    node.oninput = write;
    node.onchange = write;
    if (fieldError === id) {
      node.classList.add("bad");
      const err = document.getElementById(id + "Err");
      if (err) err.textContent = "Revisá este dato.";
    }
  }

  function paintData() {
    const kind = rubro();
    let html =
      '<p class="section-label">Datos de contacto</p>' +
      inputField("name", "Nombre y apellido", customerName, 'autocomplete="name" maxlength="80" placeholder="Ej. Juan Pérez"') +
      inputField("phone", "Teléfono", customerPhone, 'autocomplete="tel" inputmode="tel" maxlength="40" placeholder="Ej. 11 2345-6789"') +
      inputField("email", "Correo electrónico", profile.email, 'autocomplete="email" maxlength="80" placeholder="Opcional"');
    if (kind === "taller" || kind === "clinica") {
      html += inputField("document", "DNI", profile.document, 'inputmode="numeric" maxlength="13" placeholder="Ej. 30123456"');
    }
    if (kind === "clinica") {
      html +=
        '<p class="section-label">Datos del paciente</p>' +
        inputField("birth", "Fecha de nacimiento", profile.birth, 'type="date"') +
        selectField("gender", "Género", profile.gender, [
          { value: "", label: "Prefiero no responder" },
          { value: "femenino", label: "Femenino" },
          { value: "masculino", label: "Masculino" },
          { value: "otro", label: "Otro" },
        ]) +
        inputField("insurance", "Obra social o prepaga", profile.insurance, 'maxlength="80" placeholder="Opcional. Ej. OSDE"') +
        inputField("affiliate", "Número de afiliado", profile.affiliate, 'maxlength="40" placeholder="Opcional"');
    }
    if (kind === "taller") {
      html +=
        '<p class="section-label">Vehículo</p>' +
        selectField("kind", "Tipo", profile.kind, [
          { value: "", label: "Elegí el tipo" },
          { value: "auto", label: "Auto" },
          { value: "camioneta", label: "Camioneta / chata" },
          { value: "suv", label: "SUV" },
          { value: "utilitario", label: "Utilitario" },
          { value: "moto", label: "Moto" },
          { value: "otro", label: "Otro" },
        ]) +
        inputField("brand", "Marca", profile.brand, 'maxlength="40" placeholder="Ej. Fiat"') +
        inputField("model", "Modelo", profile.model, 'maxlength="40" placeholder="Ej. Cronos"') +
        selectField("year", "Año", profile.year, yearOptions()) +
        inputField("plate", "Patente", profile.plate, 'maxlength="12" autocapitalize="characters" placeholder="Ej. AB123CD"') +
        inputField("km", "Kilometraje actual", profile.km, 'inputmode="numeric" maxlength="7" placeholder="Ej. 45000"') +
        inputField("vehicleNotes", "Observaciones", profile.vehicleNotes, 'maxlength="200" placeholder="Opcional"') +
        '<p class="section-label">Turno</p>' +
        inputField("reason", "Motivo", profile.reason, 'maxlength="200" placeholder="Ej. hace ruido al frenar"');
    }
    html +=
      kind === "taller"
        ? '<p class="note">Si ya viniste, usá el mismo DNI y la misma patente. El local no duplica la ficha ni el vehículo.</p>'
        : '<p class="note">Si ya sacaste un turno con este teléfono, el local reutiliza tu ficha.</p>';
    stepBody.innerHTML = html;
    bindField("name", (value) => { customerName = value; });
    bindField("phone", (value) => { customerPhone = value; });
    bindField("email", (value) => { profile.email = value; });
    bindField("document", (value) => { profile.document = value; });
    bindField("birth", (value) => { profile.birth = value; });
    bindField("gender", (value) => { profile.gender = value; });
    bindField("insurance", (value) => { profile.insurance = value; });
    bindField("affiliate", (value) => { profile.affiliate = value; });
    bindField("kind", (value) => { profile.kind = value; });
    bindField("brand", (value) => { profile.brand = value; });
    bindField("model", (value) => { profile.model = value; });
    bindField("year", (value) => { profile.year = value; });
    bindField("km", (value) => { profile.km = value; });
    bindField("vehicleNotes", (value) => { profile.vehicleNotes = value; });
    bindField("reason", (value) => { profile.reason = value; });
    const plate = document.getElementById("plate");
    if (plate) {
      plate.oninput = () => {
        profile.plate = plate.value.toUpperCase();
        plate.value = profile.plate;
        plate.classList.remove("bad");
      };
    }
  }

  function reviewHtml() {
    const service = selectedService();
    const resource = selectedResource();
    const price = service ? money(service.price) : "";
    const when = date ? labelDateLong(date) : "Sin fecha";
    const hour = startsAt ? String(startsAt).slice(11, 16) : "";
    return (
      '<div class="summary">' +
      sumBlock("Servicio", service ? service.name : "Sin servicio", serviceMinutes(service) ? serviceMinutes(service) + " min" : "") +
      sumBlock(personWord(), resource ? resource.name : anyResource ? "El primer profesional libre" : "Sin profesional") +
      sumBlock("Fecha y hora", hour ? when + " · " + hour : when, "", true) +
      sumBlock("Precio", price || "Se paga en el local", price ? "Se paga en el local." : "") +
      sumBlock("Nombre", customerName || "Sin nombre") +
      sumBlock("Teléfono", customerPhone || "Sin teléfono") +
      (profile.email ? sumBlock("Correo", profile.email) : "") +
      (rubro() === "taller" && profile.plate
        ? sumBlock("Vehículo", [profile.brand, profile.model, profile.plate].filter(Boolean).join(" · "))
        : "") +
      (rubro() === "clinica" && profile.insurance ? sumBlock("Obra social", profile.insurance) : "") +
      "</div>"
    );
  }

  function paintReview() {
    stepBody.innerHTML = reviewHtml();
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
    nextBtn.textContent = sending && item.id === "review" ? "Confirmando…" : item.id === "review" ? "Confirmar turno" : "Seguir";
    nextBtn.disabled = sending || loading;
    if (step !== paintedStep) {
      stepBody.classList.remove("step-in");
      void stepBody.offsetWidth;
      stepBody.classList.add("step-in");
      paintedStep = step;
    }
    if (item.id === "service") {
      stepHint.textContent = "Elegí uno. El pago es en el local.";
      const allServices = shop.services || [];
      const query = serviceQuery.trim().toLowerCase();
      const showSearch = allServices.length >= 6;
      const services = allServices.filter(
        (service) => !showSearch || !query || String(service.name || "").toLowerCase().includes(query),
      );
      stepBody.innerHTML =
        (showSearch
          ? '<label class="search" for="serviceQuery">Buscar servicio</label><input id="serviceQuery" class="search" placeholder="Buscar servicio" value="' +
            esc(serviceQuery) +
            '" />'
          : "") +
        '<div class="picks">' +
        (services.length
          ? services
              .map((service) => {
                const price = money(service.price);
                const on = service.sync_id === serviceId;
                return (
                  '<button type="button" class="pick' +
                  (on ? " on" : "") +
                  '" data-key="' +
                  esc(service.sync_id) +
                  '"><span class="avatar" aria-hidden="true">' +
                  esc(initial(service.name)) +
                  '</span><span class="pick-copy"><strong>' +
                  esc(service.name) +
                  "</strong><small>" +
                  esc(serviceMinutes(service) ? serviceMinutes(service) + " min" : "Turno") +
                  "</small></span>" +
                  (price ? '<span class="price">' + esc(price) + "</span>" : "") +
                  (on ? '<span class="check" aria-hidden="true">✓</span>' : "") +
                  "</button>"
                );
              })
              .join("")
          : '<p class="note">No hay un servicio con ese nombre.</p>') +
        "</div>";
      const search = document.getElementById("serviceQuery");
      if (search) {
        search.oninput = () => {
          serviceQuery = search.value;
          focusSearch = true;
          paint();
        };
        if (focusSearch) {
          search.focus();
          const end = search.value.length;
          search.setSelectionRange(end, end);
          focusSearch = false;
        }
      }
      stepBody.querySelectorAll(".pick").forEach((button) => {
        button.onclick = () => {
          serviceId = button.getAttribute("data-key") || "";
          const allowed = offeredResources();
          if (resourceId && !allowed.some((item) => item.id === resourceId)) {
            resourceId = 0;
            anyResource = false;
            chosenResourceId = 0;
          }
          startsAt = "";
          date = "";
          fieldError = "";
          loadAgenda().catch((error) => showError(error.message));
        };
      });
    } else if (item.id === "resource") {
      const team = offeredResources();
      stepHint.textContent = !team.length
        ? "Nadie del equipo está marcado para este servicio. En el local, abrí el servicio y elegí quién lo hace, o dejalo sin marcar."
        : team.length < (shop.resources || []).length
          ? "Solo aparece quien hace este servicio. También podés pedir el primero que esté libre."
          : "Podés elegir a alguien o el primer horario libre del equipo.";
      const people = [
        {
          key: "any",
          title: "Cualquier " + personWord().toLowerCase() + " disponible",
          meta: "Te asignamos a quien tenga ese horario libre.",
        },
      ].concat(
        offeredResources().map((resource) => ({
          key: String(resource.id),
          title: resource.name,
          meta: "",
        })),
      );
      stepBody.innerHTML = people
        .map((person) => {
          const selected = person.key === "any" ? anyResource : !anyResource && String(resourceId) === person.key;
          return (
            '<button type="button" class="pick' +
            (person.key === "any" ? " any" : "") +
            (selected ? " on" : "") +
            '" data-key="' +
            esc(person.key) +
            '"><span class="avatar" aria-hidden="true">' +
            esc(person.key === "any" ? "✦" : initial(person.title)) +
            '</span><span class="pick-copy"><strong>' +
            esc(person.title) +
            "</strong>" +
            (person.meta ? "<small>" + esc(person.meta) + "</small>" : "") +
            "</span>" +
            (selected ? '<span class="check" aria-hidden="true">✓</span>' : "") +
            "</button>"
          );
        })
        .join("");
      stepBody.querySelectorAll(".pick").forEach((button) => {
        button.onclick = () => {
          const key = button.getAttribute("data-key") || "";
          const nextAny = key === "any";
          const nextId = nextAny ? 0 : Number(key) || 0;
          if (nextAny === anyResource && nextId === resourceId) return;
          anyResource = nextAny;
          resourceId = nextId;
          chosenResourceId = nextId;
          startsAt = "";
          date = "";
          fieldError = "";
          loadAgenda().catch((error) => showError(error.message));
        };
      });
    } else if (item.id === "when") {
      stepHint.textContent = hoursText();
      paintCalendar();
    } else if (item.id === "data") {
      stepHint.textContent =
        rubro() === "taller"
          ? "Datos del cliente, del vehículo y el motivo del turno."
          : rubro() === "clinica"
            ? "Datos del paciente para la ficha. No hace falta un diagnóstico."
            : "Nombre y teléfono. El correo es opcional.";
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
    if (item.id === "resource" && !anyResource && !resourceId) {
      return "Elegí un " + personWord().toLowerCase() + " o cualquiera disponible.";
    }
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
      if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
        fieldError = "email";
        return "Revisá el correo.";
      }
      const kind = rubro();
      if (kind === "taller" || kind === "clinica") {
        const dni = profile.document.replace(/\D/g, "");
        if (dni.length < 7 || dni.length > 11) {
          fieldError = "document";
          return "Revisá el DNI.";
        }
      }
      if (kind === "clinica") {
        const born = new Date(profile.birth + "T12:00:00");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birth) || Number.isNaN(born.getTime()) || born > new Date() || born.getFullYear() < 1900) {
          fieldError = "birth";
          return "Revisá la fecha de nacimiento.";
        }
      }
      if (kind === "taller") {
        if (!profile.kind) {
          fieldError = "kind";
          return "Elegí el tipo de vehículo.";
        }
        if (profile.brand.trim().length < 2) {
          fieldError = "brand";
          return "Completá la marca.";
        }
        if (!profile.model.trim()) {
          fieldError = "model";
          return "Completá el modelo.";
        }
        if (!profile.year) {
          fieldError = "year";
          return "Elegí el año.";
        }
        const plate = profile.plate.replace(/[^A-Za-z0-9]/g, "");
        if (plate.length < 5 || plate.length > 10) {
          fieldError = "plate";
          return "Revisá la patente.";
        }
        profile.km = profile.km.replace(/\D/g, "");
        if (!profile.km || Number(profile.km) > 2000000) {
          fieldError = "km";
          return "Revisá el kilometraje.";
        }
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
        encodeURIComponent(anyResource ? "any" : String(resourceId || "")) +
        "&service=" +
        encodeURIComponent(serviceId || "");
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const failure = new Error(data.error || "No se pudo cargar la agenda.");
        failure.status = res.status;
        throw failure;
      }
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

  function bookingDetails() {
    const kind = rubro();
    const details = {};
    if (profile.email.trim()) details.email = profile.email.trim();
    if (kind === "taller") {
      details.document = profile.document.replace(/\D/g, "");
      if (profile.reason.trim()) details.reason = profile.reason.trim();
      details.vehicle = {
        kind: profile.kind,
        brand: profile.brand.trim(),
        model: profile.model.trim(),
        year: Number(profile.year),
        plate: profile.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        km: Number(profile.km),
        notes: profile.vehicleNotes.trim(),
      };
    } else if (kind === "clinica") {
      details.document = profile.document.replace(/\D/g, "");
      details.birth_date = profile.birth;
      if (profile.gender) details.gender = profile.gender;
      if (profile.insurance.trim()) details.insurance = profile.insurance.trim();
      if (profile.affiliate.trim()) details.affiliate = profile.affiliate.trim();
    }
    return details;
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
          resource_id: anyResource ? chosenResourceId : resourceId,
          starts_at: startsAt,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          details: bookingDetails(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo reservar.");
      lastBooking = data;
      app.hidden = true;
      statusEl.hidden = true;
      done.hidden = false;
      const confirmed = data.status === "confirmed";
      document.getElementById("doneTitle").textContent = confirmed ? "Turno confirmado" : "Turno programado";
      doneText.textContent = confirmed
        ? "El local ya confirmó este turno."
        : "Quedó programado. El local lo confirma en la agenda.";
      const price = money(data.service_price);
      const when = labelDateLong(String(data.starts_at).slice(0, 10));
      const hour = String(data.starts_at).slice(11, 16);
      document.getElementById("doneSummary").innerHTML =
        '<div class="summary">' +
        sumBlock("Servicio", data.service_name || "", serviceMinutes(selectedService()) ? serviceMinutes(selectedService()) + " min" : "") +
        sumBlock(personWord(), data.resource_name || "") +
        sumBlock("Fecha y hora", when + " · " + hour, "", true) +
        sumBlock("Precio", price || "Se paga en el local", price ? "Se paga en el local." : "") +
        sumBlock("Nombre", data.customer_name || "") +
        "</div>";
    } catch (error) {
      const message = error.message || "No se pudo reservar.";
      const slotTaken = /horario|ocup|tomad/i.test(message);
      if (slotTaken) {
        startsAt = "";
        const when = flow().findIndex((item) => item.id === "when");
        if (when >= 0) step = when;
        await loadAgenda().catch(() => {});
      }
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

  function downloadCalendar(data) {
    if (!data || !data.starts_at || !data.ends_at) return;
    const stamp = (value) => String(value).replace(/[-:]/g, "").replace(" ", "T").slice(0, 15);
    const text = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WalQo//Turnos//ES",
      "BEGIN:VEVENT",
      "DTSTART:" + stamp(data.starts_at),
      "DTEND:" + stamp(data.ends_at),
      "SUMMARY:" + String(data.service_name || "Turno").replace(/[\r\n]/g, " "),
      "DESCRIPTION:Turno programado en " + String(data.business_name || "el local"),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
    link.download = "turno.ics";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  document.getElementById("cal").onclick = () => downloadCalendar(lastBooking);

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
      const fromPath = !new URLSearchParams(window.location.search).get("t");
      if (error.status === 404 && fromPath && typeof window.walqoOpenCarta === "function") {
        if (window.walqoOpenCarta(code)) return;
      }
      statusEl.textContent = error.message || "No se pudo cargar la agenda.";
    }
  }

  boot();
})();
