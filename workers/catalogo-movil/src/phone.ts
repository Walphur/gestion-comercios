export const PHONE_PAGE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0f2744" />
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
    background: #0f2744;
    color: #fff;
    padding: calc(14px + env(safe-area-inset-top)) 16px 16px;
  }
  header h1 { margin: 0; font-size: 1.15rem; font-weight: 650; }
  header p { margin: 4px 0 0; font-size: 0.85rem; opacity: 0.85; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  main { padding: 14px 14px calc(24px + env(safe-area-inset-bottom)); max-width: 640px; margin: 0 auto; min-width: 0; }
  .card {
    background: #fff;
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    min-width: 0;
  }
  label { display: block; font-size: 0.78rem; color: #475569; margin-bottom: 4px; }
  input, button { font: inherit; }
  input {
    width: 100%;
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 12px;
    font-size: 16px;
    background: #fff;
  }
  button {
    border: 0;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 0.95rem;
    font-weight: 650;
    cursor: pointer;
  }
  button.primary { background: #1d4ed8; color: #fff; width: 100%; }
  button.ghost { background: #e2e8f0; color: #0f172a; }
  button.tiny { padding: 8px 12px; min-width: 44px; }
  .row { display: flex; gap: 8px; min-width: 0; align-items: center; }
  .grow { flex: 1; min-width: 0; }
  .name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: #64748b; font-size: 0.85rem; margin-top: 2px; }
  .err { color: #b91c1c; font-size: 0.85rem; margin-top: 8px; }
  .note { color: #475569; font-size: 0.82rem; line-height: 1.4; }
  .banner { background: #fff7ed; color: #9a3412; border-radius: 10px; padding: 10px 12px; font-size: 0.82rem; margin-bottom: 12px; }
  .variant { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px; }
  .hidden { display: none; }
</style>
</head>
<body>
<header>
  <h1>WalQo</h1>
  <p id="shop">Productos del comercio</p>
</header>
<main>
  <section id="login" class="card">
    <p class="note">En la compu, entrá a Configuración → App del celular y copiá el código.</p>
    <label for="code" style="margin-top:12px">Código</label>
    <input id="code" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="Ej. K7MQ2P" />
    <button class="primary" id="enter" style="margin-top:12px">Entrar</button>
    <p id="loginErr" class="err"></p>
  </section>
  <section id="app" class="hidden">
    <p id="hint" class="note" style="margin-top:0">Lo que cambiás acá llega a la compu si WalQo está abierto.</p>
    <div id="conflicts"></div>
    <div class="card">
      <input id="q" placeholder="Buscar producto" />
    </div>
    <div id="list"></div>
    <div class="card">
      <strong>Producto nuevo</strong>
      <label for="nName" style="margin-top:10px">Nombre</label>
      <input id="nName" />
      <label for="nPrice" style="margin-top:8px">Precio</label>
      <input id="nPrice" inputmode="decimal" />
      <label for="nStock" style="margin-top:8px">Cantidad</label>
      <input id="nStock" inputmode="decimal" value="0" />
      <button class="primary" id="create" style="margin-top:12px">Agregar</button>
      <p id="createErr" class="err"></p>
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
function render() {
  var q = ($("q").value || "").trim().toLowerCase();
  var html = "";
  catalog.filter(function (p) {
    if (!q) return true;
    return (p.name || "").toLowerCase().indexOf(q) >= 0 || (p.sku || "").toLowerCase().indexOf(q) >= 0;
  }).forEach(function (p) {
    var variants = p.variants || [];
    var body = "";
    if (p.has_variants && variants.length) {
      variants.forEach(function (v) {
        body += '<div class="variant">'
          + '<div class="name">' + esc(v.label || "Modelo") + "</div>"
          + '<div class="meta">Cantidad ' + qty(v.stock) + (v.price != null ? " · $ " + money(v.price) : "") + "</div>"
          + '<div class="row" style="margin-top:8px">'
          + '<button class="ghost tiny" data-act="delta" data-id="' + esc(p.sync_id) + '" data-var="' + esc(v.sync_id) + '" data-d="-1">−</button>'
          + '<button class="ghost tiny" data-act="delta" data-id="' + esc(p.sync_id) + '" data-var="' + esc(v.sync_id) + '" data-d="1">+</button>'
          + '<input class="grow" data-price="' + esc(v.sync_id) + '" value="' + (v.price != null ? v.price : "") + '" inputmode="decimal" placeholder="Precio del modelo" />'
          + '<button class="primary tiny" data-act="vprice" data-id="' + esc(p.sync_id) + '" data-var="' + esc(v.sync_id) + '">Ok</button>'
          + "</div></div>";
      });
    } else {
      body += '<div class="row" style="margin-top:8px">'
        + '<button class="ghost tiny" data-act="delta" data-id="' + esc(p.sync_id) + '" data-var="" data-d="-1">−</button>'
        + '<div class="meta grow">Cantidad ' + qty(p.stock) + "</div>"
        + '<button class="ghost tiny" data-act="delta" data-id="' + esc(p.sync_id) + '" data-var="" data-d="1">+</button>'
        + "</div>";
    }
    html += '<article class="card" data-id="' + esc(p.sync_id) + '">'
      + '<div class="name">' + esc(p.name) + "</div>"
      + '<div class="meta">$ ' + money(p.price) + (p.sku ? " · " + esc(p.sku) : "") + "</div>"
      + '<div class="row" style="margin-top:8px">'
      + '<input class="grow" data-name="' + esc(p.sync_id) + '" value="' + esc(p.name) + '" />'
      + '<input style="max-width:110px" data-pprice="' + esc(p.sync_id) + '" value="' + p.price + '" inputmode="decimal" />'
      + '<button class="primary tiny" data-act="save" data-id="' + esc(p.sync_id) + '">Guardar</button>'
      + "</div>"
      + body
      + "</article>";
  });
  $("list").innerHTML = html || '<div class="card note">No hay productos para mostrar.</div>';
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
  render();
}
$("enter").onclick = async function () {
  $("loginErr").textContent = "";
  try {
    var data = await api("/v1/claim", { method: "POST", body: { code: $("code").value } });
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    showApp(true);
    await load();
  } catch (e) {
    $("loginErr").textContent = e.message || "No se pudo entrar";
  }
};
$("leave").onclick = function () { logout(); };
$("q").oninput = function () { render(); };
$("create").onclick = async function () {
  $("createErr").textContent = "";
  try {
    await api("/v1/phone/product", {
      method: "POST",
      body: {
        name: $("nName").value,
        price: Number(String($("nPrice").value).replace(",", ".")) || 0,
        stock: Number(String($("nStock").value).replace(",", ".")) || 0
      }
    });
    $("nName").value = "";
    $("nPrice").value = "";
    $("nStock").value = "0";
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
  try {
    if (act === "delta") {
      await api("/v1/phone/stock", {
        method: "POST",
        body: { sync_id: id, variant_sync_id: btn.getAttribute("data-var") || "", delta: Number(btn.getAttribute("data-d")) }
      });
      await load();
    } else if (act === "save") {
      var card = btn.closest("article");
      await api("/v1/phone/product", {
        method: "POST",
        body: {
          sync_id: id,
          name: card.querySelector("[data-name]").value,
          price: Number(String(card.querySelector("[data-pprice]").value).replace(",", ".")) || 0
        }
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
if (token) {
  showApp(true);
  load().catch(function (e) { $("loginErr").textContent = e.message || ""; showApp(false); });
}
setInterval(function () {
  if (!token || document.hidden) return;
  load().catch(function () {});
}, 8000);
</script>
</body>
</html>`;
