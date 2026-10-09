export const PHONE_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#1d4ed8" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="WalQo" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<title>WalQo</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: #eef2f6;
    color: #0f172a;
    min-width: 0;
  }
  header {
    background: #1d4ed8;
    color: #fff;
    padding: calc(10px + env(safe-area-inset-top)) 12px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  header h1 { margin: 0; flex: 1; font-size: 1.15rem; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark {
    width: 36px; height: 36px; flex: 0 0 36px;
    background: #fff; border-radius: 10px; padding: 3px;
    display: grid; place-items: center;
  }
  .mark svg { width: 100%; height: 100%; display: block; }
  button.menu {
    width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
    background: transparent; color: #fff; font-size: 1.35rem; border-radius: 10px;
  }
  .backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.4); z-index: 30; }
  .drawer {
    position: fixed; top: 0; left: 0; bottom: 0; width: min(280px, 86vw);
    background: #fff; z-index: 31; overflow: auto;
    padding: calc(18px + env(safe-area-inset-top)) 12px 20px;
    box-shadow: 8px 0 28px rgba(15, 23, 42, 0.16);
  }
  .drawer-shop { margin: 0 10px 8px; font-weight: 700; font-size: 1rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drawer .sec { margin: 14px 10px 6px; font-size: 0.7rem; letter-spacing: 0.08em; color: #64748b; font-weight: 700; }
  .drawer button { width: 100%; text-align: left; background: transparent; color: #0f172a; margin: 2px 0; }
  .drawer button.on { background: #1d4ed8; color: #fff; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .tile {
    width: 100%;
    background: #fff; color: #0f172a; border-radius: 16px; padding: 18px 10px 14px;
    box-shadow: 0 8px 24px rgba(15, 39, 68, 0.06); border-top: 3px solid #1d4ed8;
  }
  .tile b { display: block; font-size: 0.95rem; }
  .tile span { display: block; margin-top: 4px; color: #64748b; font-size: 0.75rem; font-weight: 550; }
  .tile.green { border-top-color: #16a34a; }
  .tile.amber { border-top-color: #d97706; }
  main { padding: 14px 14px calc(28px + env(safe-area-inset-bottom)); max-width: 640px; margin: 0 auto; min-width: 0; }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 8px 24px rgba(15, 39, 68, 0.06);
    min-width: 0;
  }
  label { display: block; font-size: 0.78rem; color: #475569; margin-bottom: 4px; }
  input, button, a.primary { font: inherit; }
  input {
    width: 100%;
    min-width: 0;
    border: 1px solid #d5deea;
    border-radius: 12px;
    padding: 12px;
    font-size: 16px;
    background: #f8fafc;
  }
  button, a.primary {
    border: 0;
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 0.95rem;
    font-weight: 650;
    cursor: pointer;
    text-decoration: none;
    text-align: center;
  }
  button.primary, a.primary { background: #1d4ed8; color: #fff; width: 100%; display: block; }
  button.ghost { background: #e8eef6; color: #0f2744; }
  button.textbtn {
    background: transparent;
    color: #1d4ed8;
    padding: 8px 0;
    width: auto;
    font-size: 0.85rem;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border-radius: 14px;
    padding: 0 12px;
    margin-bottom: 10px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    min-width: 0;
  }
  .search span { color: #94a3b8; font-size: 1.05rem; }
  .search input { border: 0; background: transparent; padding: 12px 0; box-shadow: none; }
  button.add {
    width: 100%;
    margin-bottom: 12px;
    box-shadow: 0 8px 18px rgba(29, 78, 216, 0.28);
  }
  .grow { flex: 1; min-width: 0; }
  .name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: #64748b; font-size: 0.85rem; margin-top: 2px; }
  .err { color: #b91c1c; font-size: 0.85rem; margin-top: 8px; }
  .note { color: #475569; font-size: 0.82rem; line-height: 1.45; }
  .banner { background: #fff7ed; color: #9a3412; border-radius: 12px; padding: 10px 12px; font-size: 0.82rem; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; min-width: 0; }
  .span2 { grid-column: 1 / -1; min-width: 0; }
  .pcard {
    position: relative;
    background: #fff;
    border-radius: 12px;
    padding: 10px 10px 12px;
    min-width: 0;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 6px 16px rgba(15, 39, 68, 0.06);
    display: flex;
    flex-direction: column;
  }
  .pcard.open { grid-column: 1 / -1; }
  .pname {
    font-weight: 650;
    font-size: 0.86rem;
    line-height: 1.25;
    min-height: 2.15em;
    padding-right: 34px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pmeta { color: #64748b; font-size: 0.75rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ask { color: #00a650; font-size: 0.72rem; font-weight: 650; margin-top: 6px; }
  button.round {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    display: grid;
    place-items: center;
  }
  button.round svg { display: block; }
  .groupline { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 2px 2px 0; }
  .groupline strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .editor { padding: 0 0 12px; }
  .hidden { display: none !important; }
  .tabs { display: flex; gap: 8px; margin-bottom: 12px; background: #fff; padding: 4px; border-radius: 14px; box-shadow: 0 8px 24px rgba(15, 39, 68, 0.06); }
  .tabs button { flex: 1; min-width: 0; background: transparent; color: #334155; }
  .tabs button.on { background: #1d4ed8; color: #fff; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kpi { background: #fff; border-radius: 16px; padding: 12px; min-width: 0; box-shadow: 0 8px 24px rgba(15, 39, 68, 0.06); }
  .kpi b { display: block; font-size: 1.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin-top: 6px; }
  .bar span { display: block; height: 100%; background: #1d4ed8; }
  .line { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid #e2e8f0; min-width: 0; }
  .line span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line strong { flex-shrink: 0; }
  .price { font-size: 1.12rem; font-weight: 750; margin-top: 8px; color: #0f172a; letter-spacing: -0.02em; }
  .stepper { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .stepper button { width: 44px; height: 44px; padding: 0; font-size: 1.35rem; border-radius: 14px; }
  .stepper .count { flex: 1; text-align: center; font-weight: 700; font-size: 1.15rem; }
  .panel { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .install { width: 100%; margin-top: 10px; }
  .install-card { border: 1px solid #dbe7ff; }
  #leave { margin-top: 4px; background: transparent; color: #64748b; }
</style>
</head>
<body>
<header>
  <button type="button" id="menuBtn" class="menu" aria-label="Menú">☰</button>
  <h1 id="screenTitle">Control</h1>
  <span class="mark" aria-label="WalQo"><svg viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="qTail" x1="168" y1="156" x2="208" y2="214" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#7EB0FF"/><stop offset="100%" stop-color="#B794FF"/></linearGradient></defs><path d="M196 176A78 78 0 1 0 128 204" fill="none" stroke="#4B8BFF" stroke-width="42" stroke-linecap="round"/><rect x="164" y="148" width="32" height="80" rx="16" transform="rotate(-42 180 188)" fill="url(#qTail)"/></svg></span>
</header>
<div id="backdrop" class="backdrop hidden"></div>
<nav id="drawer" class="drawer hidden">
  <p id="shop" class="drawer-shop"></p>
  <button type="button" data-go="home">Inicio</button>
  <div class="sec">NEGOCIO</div>
  <button type="button" data-go="products">Inventario</button>
  <button type="button" data-go="reports">Reportes</button>
</nav>
<main>
  <section id="login" class="card">
    <p class="note">En la compu, entrá a Configuración → App del celular y copiá el código.</p>
    <label for="code" style="margin-top:12px">Código</label>
    <input id="code" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="Ej. K7MQ2P" />
    <button class="primary" id="enter" style="margin-top:12px">Entrar</button>
    <p id="loginErr" class="err"></p>
  </section>
  <section id="app" class="hidden">
    <div id="iosInstall" class="card install-card hidden">
      <strong>Dejar WalQo en el inicio</strong>
      <p class="note">Chrome en el iPhone no puede guardar la página. Este botón instala el ícono, como una app.</p>
      <a id="iosGo" class="primary install" href="/instalar">Instalar en el iPhone</a>
      <p class="note">Cuando diga Perfil descargado, tocá Cerrar. Después abrí Configuración, General, VPN y gestión de dispositivos, WalQo e Instalar. Si dice que no está firmado, es de tu comercio: instalalo igual.</p>
    </div>
    <button type="button" id="install" class="primary install hidden">Instalar en el celular</button>
    <div id="homeView">
      <div id="homeBody"></div>
      <div class="tiles">
        <button type="button" class="tile" data-go="products"><b>Inventario</b><span>Productos y stock</span></button>
        <button type="button" class="tile green" data-go="reports"><b>Reportes</b><span>Ventas del día</span></button>
        <button type="button" class="tile amber" data-go="new"><b>+ Producto</b><span>Nombre, precio y costo</span></button>
      </div>
    </div>
    <div id="productsView" class="hidden">
    <div class="search">
      <span aria-hidden="true">⌕</span>
      <input id="q" placeholder="Buscar producto" />
    </div>
    <button type="button" id="addBtn" class="primary add">+ Producto</button>
    <div id="createBox" class="card hidden">
      <strong>Producto nuevo</strong>
      <label for="nName" style="margin-top:10px">Nombre</label>
      <input id="nName" />
      <label for="nPrice" style="margin-top:8px">Precio</label>
      <input id="nPrice" inputmode="decimal" />
      <label for="nCost" style="margin-top:8px">Costo</label>
      <input id="nCost" inputmode="decimal" />
      <label for="nStock" style="margin-top:8px">Cantidad</label>
      <input id="nStock" inputmode="decimal" value="0" />
      <button class="primary" id="create" style="margin-top:12px">Agregar</button>
      <p id="createErr" class="err"></p>
    </div>
    <p id="hint" class="note" style="margin-top:0">Lo que cambiás acá llega a la compu si WalQo está abierto.</p>
    <div id="conflicts"></div>
    <div id="list"></div>
    </div>
    <div id="reportsView" class="hidden">
      <p class="note">Los mismos números de la web: ventas, pagos, productos y stock bajo. Salen de la compu con WalQo abierto.</p>
      <div id="reportBody"></div>
    </div>
    <button class="ghost" id="leave" style="width:100%">Salir de este celular</button>
  </section>
</main>
<script>
var TOKEN_KEY = "walqo_catalog_token";
var token = localStorage.getItem(TOKEN_KEY) || "";
var catalog = [];
function $(id) { return document.getElementById(id); }
function money(n) {
  var v = Number(n || 0);
  try { return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch (e) { return String(v); }
}
function qty(n) {
  var v = Number(n || 0);
  if (Math.abs(v - Math.round(v)) < 0.0001) return String(Math.round(v));
  return String(Math.round(v * 1000) / 1000);
}
async function api(path, opts) {
  opts = opts || {};
  var headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  var res = await fetch(path, {
    method: opts.method || "GET",
    headers: headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  var data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (res.status === 401) { logout(); throw new Error("El código venció. Pedí uno nuevo en la compu."); }
  if (!res.ok || data.ok === false) throw new Error(data.error || "No se pudo guardar");
  return data;
}
function showApp(on) {
  $("login").classList.toggle("hidden", on);
  $("app").classList.toggle("hidden", !on);
}
function logout() {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  showApp(false);
}
function stepper(id, variantId, stock) {
  return '<div class="stepper">'
    + '<button type="button" class="ghost" data-act="delta" data-id="' + esc(id) + '" data-var="' + esc(variantId) + '" data-d="-1">−</button>'
    + '<div class="count">' + qty(stock) + "</div>"
    + '<button type="button" class="ghost" data-act="delta" data-id="' + esc(id) + '" data-var="' + esc(variantId) + '" data-d="1">+</button>'
    + "</div>";
}
function pencil() {
  return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
}
function roundBtn(panel) {
  return '<button type="button" class="round" data-act="toggle" data-open="' + esc(panel) + '" aria-label="Editar">' + pencil() + "</button>";
}
function productCard(title, price, stock, panel, editor) {
  var on = Number(stock) > 0;
  return '<article class="pcard"><div class="pname">' + esc(title) + "</div>"
    + '<div class="price">$ ' + money(price) + "</div>"
    + '<div class="pmeta">Stock: ' + qty(stock) + "</div>"
    + '<div class="' + (on ? "ask" : "pmeta") + '">' + (on ? "Disponible en el local" : "Sin stock") + "</div>"
    + roundBtn(panel)
    + editor
    + "</article>";
}
function render() {
  var q = ($("q").value || "").trim().toLowerCase();
  var html = "";
  var shown = catalog.filter(function (p) {
    if (!q) return true;
    var blob = (p.name || "") + " " + (p.sku || "");
    (p.variants || []).forEach(function (v) { blob += " " + (v.label || ""); });
    return blob.toLowerCase().indexOf(q) >= 0;
  });
  shown.forEach(function (p) {
    var variants = p.variants || [];
    if (p.has_variants && variants.length) {
      var namePanel = "name-" + p.sync_id;
      html += '<article class="span2" data-id="' + esc(p.sync_id) + '">'
        + '<div class="groupline"><strong>' + esc(p.name) + "</strong>"
        + '<button type="button" class="textbtn" data-act="toggle" data-open="' + esc(namePanel) + '">Nombre o costo</button></div>'
        + '<div class="editor panel hidden" data-panel="' + esc(namePanel) + '">'
        + "<label>Nombre</label>"
        + '<input data-name="' + esc(p.sync_id) + '" value="' + esc(p.name) + '" />'
        + "<label>Costo</label>"
        + '<input data-pcost="' + esc(p.sync_id) + '" value="' + (p.cost || 0) + '" inputmode="decimal" />'
        + '<button type="button" class="primary" data-act="save" data-id="' + esc(p.sync_id) + '" data-keep="' + p.price + '">Guardar</button>'
        + "</div></article>";
      variants.forEach(function (v) {
        var price = v.price != null ? v.price : p.price;
        var panel = "price-" + v.sync_id;
        var editor = '<div class="editor panel hidden" data-panel="' + esc(panel) + '">'
          + "<label>Precio de este modelo</label>"
          + '<input data-price="' + esc(v.sync_id) + '" value="' + price + '" inputmode="decimal" />'
          + '<button type="button" class="primary" data-act="vprice" data-id="' + esc(p.sync_id) + '" data-var="' + esc(v.sync_id) + '">Guardar precio</button>'
          + stepper(p.sync_id, v.sync_id, v.stock)
          + "</div>";
        html += productCard(v.label || "Modelo", price, v.stock, panel, editor);
      });
    } else {
      var editPanel = "edit-" + p.sync_id;
      var editor2 = '<div class="editor panel hidden" data-panel="' + esc(editPanel) + '">'
        + "<label>Nombre</label>"
        + '<input data-name="' + esc(p.sync_id) + '" value="' + esc(p.name) + '" />'
        + "<label>Precio</label>"
        + '<input data-pprice="' + esc(p.sync_id) + '" value="' + p.price + '" inputmode="decimal" />'
        + "<label>Costo</label>"
        + '<input data-pcost="' + esc(p.sync_id) + '" value="' + (p.cost || 0) + '" inputmode="decimal" />'
        + '<button type="button" class="primary" data-act="save" data-id="' + esc(p.sync_id) + '">Guardar</button>'
        + stepper(p.sync_id, "", p.stock)
        + "</div>";
      html += productCard(p.name, p.price, p.stock, editPanel, editor2);
    }
  });
  $("list").innerHTML = html
    ? '<div class="grid">' + html + "</div>"
    : '<div class="card note">No hay productos para mostrar.</div>';
}
function editing() {
  var el = document.activeElement;
  return !!(el && el.closest && (el.closest("#list") || el.closest("#createBox")));
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
async function load() {
  var data = await api("/v1/catalog");
  catalog = data.products || [];
  $("shop").textContent = data.business_name || "Productos del comercio";
  var box = $("conflicts");
  var items = data.conflicts || [];
  box.innerHTML = items.length
    ? '<div class="banner">La compu y el celular cambiaron lo mismo. Quedó el cambio que llegó último. ' + items.length + " para revisar en la compu.</div>"
    : "";
  if (!editing()) render();
}
$("enter").onclick = async function () {
  $("loginErr").textContent = "";
  try {
    var data = await api("/v1/claim", { method: "POST", body: { code: $("code").value } });
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    showApp(true);
    showScreen("home");
  } catch (e) {
    $("loginErr").textContent = e.message || "No se pudo entrar";
  }
};
$("leave").onclick = function () { logout(); };
$("q").oninput = function () { render(); };
$("addBtn").onclick = function () {
  var box = $("createBox");
  var hidden = box.classList.toggle("hidden");
  $("addBtn").textContent = hidden ? "+ Producto" : "Cerrar";
  $("addBtn").setAttribute("aria-label", hidden ? "Producto nuevo" : "Cerrar");
  if (!hidden) $("nName").focus();
};
$("create").onclick = async function () {
  $("createErr").textContent = "";
  try {
    await api("/v1/phone/product", {
      method: "POST",
      body: {
        name: $("nName").value,
        price: Number(String($("nPrice").value).replace(",", ".")) || 0,
        cost: Number(String($("nCost").value).replace(",", ".")) || 0,
        stock: Number(String($("nStock").value).replace(",", ".")) || 0
      }
    });
    $("nName").value = "";
    $("nPrice").value = "";
    $("nCost").value = "";
    $("nStock").value = "0";
    $("createBox").classList.add("hidden");
    $("addBtn").textContent = "+ Producto";
    await load();
  } catch (e) {
    $("createErr").textContent = e.message || "No se pudo agregar";
  }
};
$("list").onclick = async function (ev) {
  var btn = ev.target.closest("button");
  if (!btn) return;
  var id = btn.getAttribute("data-id");
  var act = btn.getAttribute("data-act");
  var card = btn.closest("article");
  if (act === "toggle" && card) {
    var open = btn.getAttribute("data-open");
    var panels = card.querySelectorAll("[data-panel]");
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].getAttribute("data-panel") === open) {
        var show = panels[i].classList.toggle("hidden") === false;
        card.classList.toggle("open", show);
        var input = panels[i].querySelector("input");
        if (show && input) input.focus();
      }
    }
    return;
  }
  try {
    if (act === "delta") {
      await api("/v1/phone/stock", {
        method: "POST",
        body: { sync_id: id, variant_sync_id: btn.getAttribute("data-var") || "", delta: Number(btn.getAttribute("data-d")) }
      });
      await load();
    } else if (act === "save") {
      var priceInput = card.querySelector("[data-pprice]");
      var costInput = card.querySelector("[data-pcost]");
      var price = priceInput
        ? Number(String(priceInput.value).replace(",", ".")) || 0
        : Number(btn.getAttribute("data-keep")) || 0;
      var body = {
        sync_id: id,
        name: card.querySelector("[data-name]").value,
        price: price
      };
      if (costInput) body.cost = Number(String(costInput.value).replace(",", ".")) || 0;
      await api("/v1/phone/product", {
        method: "POST",
        body: body
      });
      await load();
    } else if (act === "vprice") {
      var card2 = btn.closest("article");
      var vid = btn.getAttribute("data-var");
      var input = card2.querySelector('[data-price="' + vid + '"]');
      await api("/v1/phone/variant", {
        method: "POST",
        body: { product_sync_id: id, sync_id: vid, price: Number(String(input.value).replace(",", ".")) }
      });
      await load();
    }
  } catch (e) {
    alert(e.message || "No se pudo guardar");
  }
};
var PAY = { efectivo: "Efectivo", "débito": "Débito", "crédito": "Crédito", debito: "Débito", credito: "Crédito", transferencia: "Transferencia", qr: "QR", mercadopago: "Mercado Pago", payway: "Payway", fiado: "Fiado" };
function payName(id) { return PAY[id] || id || "Otro"; }
function dayLabel(iso) {
  if (!iso) return "";
  var p = String(iso).slice(0, 10).split("-");
  if (p.length < 3) return iso;
  return p[2] + "/" + p[1];
}
function lines(rows, nameFn, valueFn) {
  if (!rows || !rows.length) return '<p class="note">Nada en este período.</p>';
  return rows.map(function (row) {
    return '<div class="line"><span>' + esc(nameFn(row)) + '</span><strong>' + valueFn(row) + '</strong></div>';
  }).join("");
}
function renderReport(report) {
  if (!report) {
    $("reportBody").innerHTML = '<div class="card note">Todavía no hay reportes. Abrí WalQo en la compu y esperá un momento.</div>';
    return;
  }
  var days = report.days || [];
  var max = 1;
  days.forEach(function (d) { if (Number(d.total) > max) max = Number(d.total); });
  var bars = days.map(function (d) {
    var w = Math.round((Number(d.total) / max) * 100);
    return '<div class="line"><span>' + dayLabel(d.day) + ' · ' + d.count + '</span><strong>$ ' + money(d.total) + '</strong></div><div class="bar"><span style="width:' + w + '%"></span></div>';
  }).join("");
  $("reportBody").innerHTML =
    '<div class="kpis" style="margin-bottom:12px">'
    + '<div class="kpi"><div class="meta">VENTAS · HOY</div><b>$ ' + money(report.today_total) + '</b><div class="meta">' + (report.today_count || 0) + ' ventas</div></div>'
    + '<div class="kpi"><div class="meta">BAJO STOCK</div><b>' + ((report.low_stock || []).length) + '</b><div class="meta">productos</div></div>'
    + '<div class="kpi"><div class="meta">AYER</div><b>$ ' + money(report.yesterday_total) + '</b><div class="meta">' + (report.yesterday_count || 0) + ' ventas</div></div>'
    + '<div class="kpi"><div class="meta">ÚLTIMAS VENTAS</div><b>' + ((report.recent_sales || []).length) + '</b><div class="meta">en el listado</div></div>'
    + '</div>'
    + '<div class="card"><strong>Últimos 7 días</strong>' + bars + '</div>'
    + '<div class="card"><strong>Métodos de pago · hoy</strong>' + lines(report.payments, function (r) { return payName(r.method) + " · " + r.count; }, function (r) { return "$ " + money(r.total); }) + '</div>'
    + '<div class="card"><strong>Por empleado · hoy</strong>' + lines(report.employees, function (r) { return r.name + " · " + r.count; }, function (r) { return "$ " + money(r.total); }) + '</div>'
    + '<div class="card"><strong>Top productos · hoy</strong>' + lines(report.top_products, function (r) { return r.name; }, function (r) { return qty(r.qty); }) + '</div>'
    + '<div class="card"><strong>Para pedir</strong>' + lines(report.low_stock, function (r) { return r.name; }, function (r) { return qty(r.stock) + " / mín " + qty(r.min_stock); }) + '</div>'
    + '<div class="card"><strong>Últimas ventas</strong>' + lines(report.recent_sales, function (r) { return dayLabel(r.at) + " " + String(r.at || "").slice(11, 16) + " · " + payName(r.payment_method); }, function (r) { return "$ " + money(r.total); }) + '</div>';
}
async function loadReports() {
  var data = await api("/v1/reports");
  lastReport = data.report || null;
  renderReport(lastReport);
  renderHome();
}
var lastReport = null;
var screen = "home";
function renderHome() {
  var box = $("homeBody");
  if (!box) return;
  if (!lastReport) {
    box.innerHTML = '<div class="card note">Los números del día salen de la compu con WalQo abierto.</div>';
    return;
  }
  var low = (lastReport.low_stock || []).length;
  box.innerHTML = '<div class="kpis" style="margin-bottom:12px">'
    + '<div class="kpi"><div class="meta">VENTAS · HOY</div><b>$ ' + money(lastReport.today_total) + '</b><div class="meta">' + (lastReport.today_count || 0) + ' ventas</div></div>'
    + '<div class="kpi"><div class="meta">BAJO STOCK</div><b>' + low + '</b><div class="meta">productos</div></div>'
    + '<div class="kpi"><div class="meta">AYER</div><b>$ ' + money(lastReport.yesterday_total) + '</b><div class="meta">' + (lastReport.yesterday_count || 0) + ' ventas</div></div>'
    + '<div class="kpi"><div class="meta">ÚLTIMAS</div><b>' + ((lastReport.recent_sales || []).length) + '</b><div class="meta">ventas cargadas</div></div>'
    + '</div>';
}
function closeMenu() {
  $("drawer").classList.add("hidden");
  $("backdrop").classList.add("hidden");
}
function showScreen(which) {
  screen = which === "new" ? "products" : which;
  var home = which === "home";
  var products = which === "products" || which === "new";
  var reports = which === "reports";
  $("homeView").classList.toggle("hidden", !home);
  $("productsView").classList.toggle("hidden", !products);
  $("reportsView").classList.toggle("hidden", !reports);
  var title = $("screenTitle");
  if (title) title.textContent = home ? "Control" : reports ? "Reportes" : "Inventario";
  var buttons = $("drawer").querySelectorAll("button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle("on", buttons[i].getAttribute("data-go") === (which === "new" ? "products" : which));
  }
  closeMenu();
  if (which === "new") {
    $("createBox").classList.remove("hidden");
    $("addBtn").textContent = "Cerrar";
    $("nName").focus();
  }
  if (home || reports) {
    loadReports().catch(function (e) {
      if (reports) $("reportBody").innerHTML = '<p class="err">' + esc(e.message || "No se pudo cargar") + '</p>';
    });
  }
  if (products || home) load().catch(function () {});
}
$("menuBtn").onclick = function () {
  $("drawer").classList.toggle("hidden");
  $("backdrop").classList.toggle("hidden");
};
$("backdrop").onclick = closeMenu;
document.addEventListener("click", function (ev) {
  var go = ev.target.closest("[data-go]");
  if (!go) return;
  showScreen(go.getAttribute("data-go"));
});
var ua = navigator.userAgent || "";
var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
if (ios && !standalone) {
  var iosBox = $("iosInstall");
  if (iosBox) iosBox.classList.remove("hidden");
  var iosGo = $("iosGo");
  if (iosGo && /CriOS|FxiOS|EdgiOS/i.test(ua)) {
    iosGo.href = "x-safari-https://" + location.host + "/instalar";
  }
}
var installEvent = null;
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  installEvent = event;
  var btn = $("install");
  if (btn) btn.classList.remove("hidden");
});
var installBtn = $("install");
if (installBtn) {
  installBtn.onclick = async function () {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    installBtn.classList.add("hidden");
  };
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(function () {});
}
if (token) {
  showApp(true);
  showScreen("home");
}
setInterval(function () {
  if (!token || document.hidden) return;
  if (screen === "products") load().catch(function () {});
  else loadReports().catch(function () {});
}, 8000);
</script>
</body>
</html>`;
