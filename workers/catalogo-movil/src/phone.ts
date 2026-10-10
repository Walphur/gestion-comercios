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
  :root {
    color-scheme: light;
    --bar: calc(62px + env(safe-area-inset-top));
    --bg: #eef2f6;
    --ink: #0f172a;
    --muted: #64748b;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; overflow-x: hidden; }
  html { background: #1d4ed8; }
  body {
    font-family: "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--ink);
    min-width: 0;
    overscroll-behavior-y: none;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 40;
    background: #1d4ed8;
    color: #fff;
    min-height: var(--bar);
    padding: calc(10px + env(safe-area-inset-top)) 12px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  body.busy header::after {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 2px;
    background: #fb923c;
  }
  header h1 { margin: 0; flex: 1; font-size: 1.15rem; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark {
    width: 36px; height: 36px; flex: 0 0 36px;
    background: #000; border-radius: 10px; padding: 0; overflow: hidden;
    display: block;
  }
  .mark img { width: 100%; height: 100%; display: block; object-fit: cover; }
  button.menu {
    width: 40px; height: 40px; flex: 0 0 40px; padding: 0;
    background: transparent; color: #fff; border-radius: 10px;
    display: grid; place-items: center;
  }
  button.menu svg { width: 22px; height: 22px; display: block; }
  .backdrop { position: fixed; left: 0; right: 0; bottom: 0; top: var(--bar); background: rgba(15, 23, 42, 0.4); z-index: 30; }
  .drawer {
    position: fixed; top: var(--bar); left: 0; bottom: 0; width: min(280px, 86vw);
    background: #fff; z-index: 31; overflow: auto;
    padding: 8px 10px calc(12px + env(safe-area-inset-bottom));
    box-shadow: 8px 0 24px rgba(15, 23, 42, 0.12);
    animation: slide .16s ease;
  }
  .drawer-shop { margin: 8px 12px 4px; font-weight: 700; font-size: 1rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drawer .sec { margin: 12px 12px 4px; font-size: 0.7rem; letter-spacing: 0.08em; color: #64748b; font-weight: 700; }
  .drawer button {
    width: 100%; text-align: left; background: transparent; color: #0f172a; margin: 2px 0;
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  }
  .drawer button svg { width: 20px; height: 20px; flex: 0 0 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .drawer button.on { background: #1d4ed8; color: #fff; }
  .drawer button.quiet { color: #64748b; margin-top: 10px; }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .tile {
    width: 100%; min-width: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    background: #fff; color: #1d4ed8; border-radius: 14px; padding: 10px 4px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }
  .tile b { display: block; max-width: 100%; font-size: 0.72rem; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile svg { width: 22px; height: 22px; }
  .tile.green { color: #16a34a; }
  .tile.amber { color: #d97706; }
  .tile svg, .tabbar svg, .cartfab svg {
    width: 28px; height: 28px; display: block;
    fill: none; stroke: currentColor; stroke-width: 1.8;
    stroke-linecap: round; stroke-linejoin: round;
  }
  main { padding: 12px 14px calc(100px + env(safe-area-inset-bottom)); max-width: 640px; margin: 0 auto; min-width: 0; }
  main.notabs { padding-bottom: 18px; }
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
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
  .search span { color: #94a3b8; display: grid; place-items: center; }
  .search svg { width: 18px; height: 18px; display: block; }
  .search input { border: 0; background: transparent; padding: 12px 0; box-shadow: none; }
  button.add {
    width: 100%;
    margin-bottom: 12px;
    box-shadow: none;
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
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    display: flex;
    flex-direction: column;
  }
  .pcard.open { grid-column: 1 / -1; }
  button.pcard { width: 100%; color: inherit; background: #fff; }
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
  .ask, .stock.on { color: #15803d; font-size: 0.72rem; font-weight: 650; margin-top: 6px; }
  .stock.off { color: #b91c1c; font-size: 0.72rem; font-weight: 650; margin-top: 6px; }
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
  .groupline { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; padding: 6px 2px 0; }
  .groupline strong {
    min-width: 0; font-size: 0.92rem;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .groupline .textbtn { flex: 0 0 auto; padding-top: 0; }
  .editor { padding: 0 0 12px; }
  .hidden { display: none !important; }
  .tabs { display: flex; gap: 8px; margin-bottom: 12px; background: #fff; padding: 4px; border-radius: 14px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
  .tabs button { flex: 1; min-width: 0; background: transparent; color: #334155; }
  .tabs button.on { background: #1d4ed8; color: #fff; }
  .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kpi { background: #fff; border-radius: 16px; padding: 12px; min-width: 0; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
  .kpi b { display: block; font-size: 1.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hero-stat {
    background: #1e3a8a;
    color: #fff; border-radius: 18px; padding: 16px; margin-bottom: 12px; min-width: 0;
  }
  .hero-stat .meta { color: rgba(255,255,255,.72); }
  .hero-stat b {
    display: block; margin-top: 4px; font-weight: 750; letter-spacing: -0.03em;
    font-size: clamp(1.45rem, 7vw, 2rem);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .delta { margin-top: 6px; font-size: 0.85rem; font-weight: 650; color: rgba(255,255,255,.82); }
  .delta.up { color: #bbf7d0; }
  .delta.down { color: #fecaca; }
  .chart { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 10px; }
  .chart button {
    width: 100%; min-width: 0; height: 108px; padding: 0; border-radius: 8px;
    background: transparent; color: #64748b; font-size: 0.68rem; font-weight: 700;
    display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px;
  }
  .chart .plot { width: 100%; height: 82px; display: flex; align-items: flex-end; justify-content: center; }
  .chart i {
    display: block; width: min(18px, 70%); min-height: 4px;
    border-radius: 7px 7px 3px 3px; background: #e2e8f0;
  }
  .chart button.has i { background: #93c5fd; min-height: 8px; }
  .chart button.on { color: #1d4ed8; }
  .chart button.on i { background: #1d4ed8; }
  .chart button.empty i { height: 4px !important; background: #e2e8f0; }
  .chart em { font-style: normal; line-height: 1; }
  .bar { height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin-top: 6px; }
  .bar span { display: block; height: 100%; background: #1d4ed8; }
  .line { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid #e2e8f0; min-width: 0; }
  .line span { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .line strong { flex-shrink: 0; }
  .price { font-size: 1.12rem; font-weight: 750; margin-top: 8px; color: #0f172a; letter-spacing: -0.02em; }
  .stepper { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .stepper button { width: 44px; height: 44px; padding: 0; font-size: 1.35rem; border-radius: 14px; }
  .stepper .count { flex: 1; text-align: center; font-weight: 700; font-size: 1.15rem; }
  .panel { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .install { width: 100%; margin-top: 10px; }
  .install-card { border: 1px solid #dbe7ff; }
  #leave { margin-top: 4px; background: transparent; color: #64748b; }
  .scan {
    position: fixed; inset: 0; z-index: 40; background: #0f172a;
    display: flex; flex-direction: column; gap: 10px;
    padding: calc(12px + env(safe-area-inset-top)) 12px calc(16px + env(safe-area-inset-bottom));
  }
  .scan video { width: 100%; flex: 1; min-height: 0; object-fit: cover; border-radius: 16px; background: #000; }
  .scan .note { color: #e2e8f0; margin: 0; }
  .tabbar {
    position: fixed; z-index: 25;
    left: 50%; transform: translateX(-50%);
    bottom: calc(10px + env(safe-area-inset-bottom));
    width: min(640px, calc(100% - 28px));
    min-width: 0;
    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    background: #0f172a; color: #94a3b8;
    padding: 8px 6px;
    border-radius: 26px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
  }
  .tabbar button {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    background: transparent; color: inherit; border-radius: 10px;
    padding: 6px 2px 4px; font-size: 0.68rem; font-weight: 650; line-height: 1.1; min-width: 0;
  }
  .tabbar button span { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabbar svg { width: 22px; height: 22px; }
  .tabbar button.on { color: #fb923c; }
  .cartfab {
    position: fixed; z-index: 24;
    right: max(16px, calc(50vw - 304px));
    bottom: calc(88px + env(safe-area-inset-bottom));
    width: 58px; height: 58px; padding: 0; border-radius: 999px;
    background: #111827; color: #fff;
    display: grid; place-items: center;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
  }
  .cartfab svg { width: 26px; height: 26px; }
  .cartfab .badge {
    position: absolute; top: -4px; right: -4px;
    min-width: 22px; height: 22px; padding: 0 5px; border-radius: 999px;
    background: #f97316; color: #fff; font-size: 0.72rem; font-weight: 750; line-height: 22px;
  }
  .cart-screen {
    background: #111827; color: #e5e7eb; border-radius: 22px; padding: 14px 14px 18px; min-width: 0;
    min-height: calc(100dvh - var(--bar) - 108px - env(safe-area-inset-bottom));
  }
  #sellList { padding-bottom: 72px; }
  #sellList .pname { min-height: 0; padding-right: 0; }
  #sellList .price { margin-top: 6px; font-size: 1.02rem; }
  .toast {
    position: fixed; z-index: 35;
    left: 50%; transform: translateX(-50%);
    width: min(612px, calc(100% - 28px));
    bottom: calc(90px + env(safe-area-inset-bottom));
    background: #0f172a; color: #fff;
    border-radius: 14px; padding: 12px 14px; font-size: 0.86rem;
  }
  .toast.bad { background: #7f1d1d; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes slide { from { transform: translateX(-10px); } to { transform: none; } }
  #homeView:not(.hidden), #sellView:not(.hidden), #productsView:not(.hidden), #reportsView:not(.hidden), #cartView:not(.hidden) {
    animation: rise .16s ease;
  }
  .cart-top { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .cart-top h2 { flex: 1; margin: 0; text-align: center; font-size: 1.15rem; }
  .cart-top button { width: 40px; height: 40px; padding: 0; background: transparent; color: #fff; display: grid; place-items: center; }
  #cartClear { width: auto; padding: 0 8px; font-size: 0.85rem; }
  .cart-card { background: #1f2937; border-radius: 16px; padding: 12px; margin-bottom: 12px; min-width: 0; }
  .cart-line { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid #334155; min-width: 0; }
  .cart-line:first-child { border-top: 0; }
  .cart-line .grow { flex: 1; min-width: 0; }
  .cart-line .name { color: #fff; }
  .cart-line .meta { color: #94a3b8; }
  .qtybox { display: flex; align-items: center; gap: 6px; background: #111827; border-radius: 12px; padding: 2px; }
  .qtybox button { width: 32px; height: 32px; padding: 0; background: transparent; color: #fb923c; }
  .qtybox span { min-width: 1.2rem; text-align: center; font-weight: 700; }
  .sum { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; color: #cbd5e1; }
  .sum.big { color: #fff; font-size: 1.35rem; font-weight: 750; }
  .pays { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .pays button { background: #111827; color: #cbd5e1; border-radius: 14px; padding: 10px 4px; font-size: 0.72rem; }
  .pays button.on { background: transparent; color: #fb923c; box-shadow: inset 0 0 0 2px #f97316; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chips button { width: auto; background: #111827; color: #e5e7eb; border-radius: 999px; padding: 8px 12px; }
  .payrow { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr); gap: 8px; }
  .payrow .ghost { background: #1f2937; color: #fff; }
  .cobrar { background: #f97316; color: #fff; box-shadow: 0 8px 18px rgba(249, 115, 22, 0.35); }
</style>
</head>
<body>
<header>
  <button type="button" id="menuBtn" class="menu" aria-label="Menú"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  <h1 id="screenTitle">Inicio</h1>
  <span class="mark"><img src="/apple-touch-icon.png" alt="WalQo" /></span>
</header>
<div id="backdrop" class="backdrop hidden"></div>
<nav id="drawer" class="drawer hidden">
  <p id="shop" class="drawer-shop"></p>
  <button type="button" data-go="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 10v9h12v-9"/></svg>Inicio</button>
  <div class="sec">NEGOCIO</div>
  <button type="button" data-go="sell"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.2 11h11.3l1.8-8H7"/></svg>Vender</button>
  <button type="button" data-go="products"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5 12 12 4 7.5z"/><path d="M4 7.5V16.5L12 21l8-4.5V7.5"/><path d="M12 12v9"/></svg>Inventario</button>
  <button type="button" data-go="reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/></svg>Reportes</button>
  <button type="button" id="drawerLeave" class="quiet">Salir de este celular</button>
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
        <button type="button" class="tile" data-go="sell"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.2 11h11.3l1.8-8H7"/></svg><b>Vender</b></button>
        <button type="button" class="tile" data-go="products"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5 12 12 4 7.5z"/><path d="M4 7.5V16.5L12 21l8-4.5V7.5"/><path d="M12 12v9"/></svg><b>Inventario</b></button>
        <button type="button" class="tile green" data-go="reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/></svg><b>Reportes</b></button>
        <button type="button" class="tile amber" data-go="new"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg><b>Producto</b></button>
      </div>
    </div>
    <div id="sellView" class="hidden">
      <button type="button" id="openCart" class="cartfab" aria-label="Abrir carrito">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.2 11h11.3l1.8-8H7"/></svg>
        <span id="cartCount" class="badge hidden">0</span>
        <strong id="cartPreview" class="hidden">$ 0,00</strong>
      </button>
      <div class="search">
        <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
        <input id="sellQ" placeholder="Buscar para vender" />
      </div>
      <button type="button" id="sellScan" class="ghost add">Escanear y agregar</button>
      <p id="sellNote" class="note hidden"></p>
      <div id="sellList"></div>
    </div>
    <div id="cartView" class="cart-screen hidden">
      <div class="cart-top">
        <button type="button" data-go="sell" aria-label="Volver"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6 9 12l6 6"/></svg></button>
        <span style="flex:1"></span>
        <button type="button" id="cartClear">Vaciar</button>
      </div>
      <div id="cartBody"></div>
    </div>
    <div id="productsView" class="hidden">
    <div class="search">
      <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
      <input id="q" placeholder="Buscar producto" />
    </div>
    <button type="button" id="scanBtn" class="ghost add">Escanear código</button>
    <button type="button" id="addBtn" class="primary add">+ Producto</button>
    <div id="createBox" class="card hidden">
      <strong>Producto nuevo</strong>
      <label for="nName" style="margin-top:10px">Nombre</label>
      <input id="nName" />
      <label for="nBarcode" style="margin-top:8px">Código de barras</label>
      <input id="nBarcode" inputmode="numeric" />
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
      <p class="note">El detalle del día. Los números salen de la compu con WalQo abierto.</p>
      <div id="reportBody"></div>
    </div>
    <button class="ghost" id="leave" style="width:100%">Salir de este celular</button>
    <nav class="tabbar" id="tabbar">
      <button type="button" data-go="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5"/><path d="M6 10v9h12v-9"/></svg><span>Inicio</span></button>
      <button type="button" data-go="sell"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.2 11h11.3l1.8-8H7"/></svg><span>Vender</span></button>
      <button type="button" data-go="products"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 7.5 12 12 4 7.5z"/><path d="M4 7.5V16.5L12 21l8-4.5V7.5"/><path d="M12 12v9"/></svg><span>Productos</span></button>
      <button type="button" data-go="reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/></svg><span>Reportes</span></button>
    </nav>
  </section>
</main>
<div id="toast" class="toast hidden" role="status"></div>
<div id="scanBox" class="scan hidden">
  <video id="scanVideo" playsinline autoplay muted></video>
  <p id="scanMsg" class="note">Apuntá al código de barras.</p>
  <button type="button" id="scanClose" class="ghost">Cerrar</button>
</div>
<script>
var TOKEN_KEY = "walqo_catalog_token";
var API_ORIGIN = "https://gestion-catalogo-movil.walphur.workers.dev";
function nativeApp() {
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return true;
  } catch (e) {}
  var protocol = location.protocol || "";
  return protocol === "capacitor:" || protocol === "ionic:";
}
function apiBase() {
  return nativeApp() ? API_ORIGIN : "";
}
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
  var res;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  } catch (e) {
    throw new Error("Sin conexión con WalQo. Revisá internet.");
  }
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
  var n = Number(stock) || 0;
  var tag = n > 0
    ? '<div class="stock on">En el local · ' + qty(n) + "</div>"
    : '<div class="stock off">Sin stock</div>';
  return '<article class="pcard"><div class="pname">' + esc(title) + "</div>"
    + '<div class="price">$ ' + money(price) + "</div>"
    + tag
    + roundBtn(panel)
    + editor
    + "</article>";
}
function render() {
  var q = ($("q").value || "").trim().toLowerCase();
  var html = "";
  var shown = catalog.filter(function (p) {
    if (!q) return true;
    var blob = (p.name || "") + " " + (p.sku || "") + " " + (p.barcode || "");
    (p.variants || []).forEach(function (v) { blob += " " + (v.label || "") + " " + (v.sku || ""); });
    return blob.toLowerCase().indexOf(q) >= 0 || productHitsCode(p, q);
  });
  shown.forEach(function (p) {
    var variants = p.variants || [];
    if (p.has_variants && variants.length) {
      var namePanel = "name-" + p.sync_id;
      html += '<article class="span2" data-id="' + esc(p.sync_id) + '">'
        + '<div class="groupline"><strong>' + esc(p.name) + "</strong>"
        + '<button type="button" class="textbtn" data-act="toggle" data-open="' + esc(namePanel) + '">Editar</button></div>'
        + '<div class="editor panel hidden" data-panel="' + esc(namePanel) + '">'
        + "<label>Nombre</label>"
        + '<input data-name="' + esc(p.sync_id) + '" value="' + esc(p.name) + '" />'
        + "<label>Costo</label>"
        + '<input data-pcost="' + esc(p.sync_id) + '" value="' + (p.cost || 0) + '" inputmode="decimal" />'
        + "<label>Código de barras</label>"
        + '<input data-barcode="' + esc(p.sync_id) + '" value="' + esc(p.barcode || "") + '" inputmode="text" />'
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
        + "<label>Código de barras</label>"
        + '<input data-barcode="' + esc(p.sync_id) + '" value="' + esc(p.barcode || "") + '" inputmode="text" />'
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
function releaseFocus() {
  var el = document.activeElement;
  if (el && el.blur) el.blur();
}
function paintLiveStock(card, n) {
  if (!card) return;
  var countEl = card.querySelector(".count");
  if (countEl) countEl.textContent = qty(n);
  var tag = card.querySelector(".stock");
  if (!tag) return;
  if (n > 0) {
    tag.className = "stock on";
    tag.textContent = "En el local · " + qty(n);
  } else {
    tag.className = "stock off";
    tag.textContent = "Sin stock";
  }
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
var toastTimer = null;
var busyN = 0;
function toast(text, bad) {
  var el = $("toast");
  if (!el) return;
  el.textContent = text;
  el.className = bad ? "toast bad" : "toast";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 3200);
}
function busy(on) {
  busyN += on ? 1 : -1;
  if (busyN < 0) busyN = 0;
  document.body.classList.toggle("busy", busyN > 0);
}
async function load() {
  busy(true);
  try {
  var data = await api("/v1/catalog");
  catalog = data.products || [];
  $("shop").textContent = data.business_name || "Productos del comercio";
  var box = $("conflicts");
  var items = data.conflicts || [];
  box.innerHTML = items.length
    ? '<div class="banner">La compu y el celular cambiaron lo mismo. Quedó el cambio que llegó último. ' + items.length + " para revisar en la compu.</div>"
    : "";
  if (!editing()) render();
  if (screen === "sell" && document.activeElement !== $("sellQ")) renderSell();
  } finally {
    busy(false);
  }
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
var scanStream = null;
var scanTimer = null;
var scanReader = null;
var scanLock = false;
function normCode(code) {
  return String(code || "").replace(/\s/g, "");
}
function digits(code) {
  return String(code || "").replace(/\D/g, "");
}
function sameCode(a, b) {
  var left = normCode(a).toLowerCase();
  var right = normCode(b).toLowerCase();
  if (left && left === right) return true;
  var x = digits(a);
  var y = digits(b);
  if (!x || !y || x.length < 6 || y.length < 6) return false;
  if (x === y) return true;
  var long = x.length >= y.length ? x : y;
  var short = x.length >= y.length ? y : x;
  if (long.length - short.length === 1 && long.charAt(0) === "0" && long.slice(1) === short) return true;
  return false;
}
function productHitsCode(p, code) {
  if (sameCode(p.barcode, code) || sameCode(p.sku, code)) return true;
  var hit = false;
  (p.variants || []).forEach(function (v) {
    if (sameCode(v.sku, code) || sameCode(v.barcode, code)) hit = true;
  });
  return hit;
}
function findByCode(code) {
  if (!normCode(code) && !digits(code)) return null;
  for (var i = 0; i < catalog.length; i++) {
    if (productHitsCode(catalog[i], code)) return catalog[i];
  }
  return null;
}
function stopScan() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = null;
  if (scanReader && scanReader.reset) scanReader.reset();
  scanReader = null;
  if (scanStream) scanStream.getTracks().forEach(function (t) { t.stop(); });
  scanStream = null;
  var video = $("scanVideo");
  if (video) video.srcObject = null;
  $("scanBox").classList.add("hidden");
}
function loadZxing() {
  return new Promise(function (resolve, reject) {
    if (window.ZXing && window.ZXing.BrowserMultiFormatReader) { resolve(window.ZXing); return; }
    var s = document.createElement("script");
    s.src = nativeApp()
      ? "zxing.min.js"
      : "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
    s.onload = function () { resolve(window.ZXing); };
    s.onerror = function () { reject(new Error("No se pudo abrir el lector.")); };
    document.head.appendChild(s);
  });
}
async function onCode(code) {
  if (scanLock) return;
  scanLock = true;
  var found = findByCode(code);
  var mode = scanMode;
  scanMode = "stock";
  stopScan();
  if (mode === "cart") {
    var scanned = normCode(code) || digits(code);
    $("sellQ").value = scanned;
    showScreen("sell");
    var note = $("sellNote");
    if (note) note.className = "banner";
    if (!found) {
      if (note) note.textContent = "No hay un producto con el código " + scanned + ".";
    } else if (found.has_variants && (found.variants || []).length) {
      if (note) note.textContent = found.name + " tiene modelos. Tocá el que va al carrito.";
    } else {
      addToCart(found, null);
      if (note) note.textContent = "Se agregó " + found.name + ".";
    }
    renderSell();
    scanLock = false;
    return;
  }
  if (!found) {
    showScreen("new");
    $("nBarcode").value = normCode(code);
    $("createErr").textContent = "Ese código no está cargado. Completá el producto.";
    $("nName").focus();
    scanLock = false;
    return;
  }
  showScreen("products");
  $("q").value = normCode(code) || digits(code) || found.name;
  render();
  $("conflicts").innerHTML = '<div class="banner">' + esc(found.has_variants
    ? found.name + " tiene modelos. Tocá el que querés ver."
    : "Encontrado: " + found.name + ".") + "</div>";
  scanLock = false;
}
$("scanClose").onclick = function () { scanLock = false; stopScan(); };
$("sellQ").oninput = function () { renderSell(); };
$("sellScan").onclick = function () { scanMode = "cart"; $("scanBtn").onclick(); };
$("openCart").onclick = function () { showScreen("cart"); };
$("cartClear").onclick = function () {
  if (!cart.length) return;
  if (!window.confirm("¿Vaciar el carrito?")) return;
  cart = [];
  paidInput = "";
  paintCartCount();
  renderCart();
};
$("sellList").onclick = function (ev) {
  var btn = ev.target.closest("[data-act='addcart']");
  if (!btn) return;
  var id = btn.getAttribute("data-id");
  var variantId = btn.getAttribute("data-var") || "";
  var product = null;
  catalog.forEach(function (p) { if (p.sync_id === id) product = p; });
  if (!product) return;
  var variant = null;
  (product.variants || []).forEach(function (v) { if (v.sync_id === variantId) variant = v; });
  addToCart(product, variant);
  var note = $("sellNote");
  if (note) {
    note.className = "banner";
    note.textContent = "Se agregó " + (variant ? product.name + " · " + (variant.label || "Modelo") : product.name) + ".";
  }
};
$("cartView").onclick = async function (ev) {
  var btn = ev.target.closest("button");
  if (!btn || btn.id === "cartClear") return;
  if (btn.getAttribute("data-go")) return;
  var pay = btn.getAttribute("data-pay");
  if (pay) { payMethod = pay; renderCart(); return; }
  var chip = btn.getAttribute("data-chip");
  if (chip) { paidInput = chip; renderCart(); return; }
  var key = btn.getAttribute("data-cqty");
  if (key) {
    var delta = Number(btn.getAttribute("data-d"));
    cart.forEach(function (i) { if (i.key === key) i.qty += delta; });
    cart = cart.filter(function (i) { return i.qty > 0; });
    renderCart();
    return;
  }
  if (btn.id !== "cobrar") return;
  var err = $("cartErr");
  err.textContent = "";
  if (!cart.length) { err.textContent = "Agregá un producto."; return; }
  if (payMethod === "fiado") {
    err.textContent = "El fiado se anota en la compu, con un cliente. Elegí otro medio.";
    return;
  }
  btn.disabled = true;
  try {
    var data = await api("/v1/phone/sale", {
      method: "POST",
      body: {
        payment_method: payMethod,
        paid: payMethod === "efectivo" ? Number(String(paidInput).replace(",", ".")) || 0 : cartTotal(),
        items: cart.map(function (i) {
          return { sync_id: i.sync_id, variant_sync_id: i.variant_sync_id, qty: i.qty };
        })
      }
    });
    cart = [];
    paidInput = "";
    paintCartCount();
    showScreen("sell");
    toast("Venta enviada. Se anota en la caja cuando WalQo está abierto.");
    watchSale(data.id);
  } catch (e) {
    err.textContent = e.message || "No se pudo cobrar";
    btn.disabled = false;
  }
};
function watchSale(id) {
  if (!id) return;
  var run = async function () {
    var status = { status: "pending", error: "", change_due: 0 };
    for (var n = 0; n < 12; n++) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      try {
        status = await api("/v1/phone/sale?id=" + encodeURIComponent(id));
      } catch (e) {
        toast(e.message || "No se pudo confirmar la venta.", true);
        return;
      }
      if (status.status === "done" || status.status === "error") break;
    }
    if (status.status === "done") {
      var change = Number(status.change_due) || 0;
      toast(change > 0.001 ? "Quedó en la caja. Vuelto $ " + money(change) : "Quedó en la caja de la compu.");
      load().catch(function () {});
    } else if (status.status === "error") {
      toast(status.error || "La compu no pudo anotar la venta.", true);
    } else {
      toast("Abrí WalQo en la compu, con la caja abierta, para que entre la venta.", true);
    }
  };
  run();
}
$("scanBtn").onclick = async function () {
  scanLock = false;
  $("scanMsg").textContent = "Apuntá al código de barras.";
  $("scanBox").classList.remove("hidden");
  try {
    if (window.BarcodeDetector) {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      var video = $("scanVideo");
      video.srcObject = scanStream;
      await video.play();
      var detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code", "itf"] });
      scanTimer = setInterval(function () {
        detector.detect(video).then(function (codes) {
          if (codes && codes[0] && codes[0].rawValue) onCode(codes[0].rawValue);
        }).catch(function () {});
      }, 400);
      return;
    }
    var lib = await loadZxing();
    scanReader = new lib.BrowserMultiFormatReader();
    scanReader.decodeFromVideoDevice(undefined, "scanVideo", function (result) {
      if (result) onCode(result.getText());
    });
  } catch (e) {
    $("scanMsg").textContent = (e && e.message) || "El celular no dejó usar la cámara.";
  }
};
$("addBtn").onclick = function () {
  var box = $("createBox");
  var hidden = box.classList.toggle("hidden");
  $("addBtn").textContent = hidden ? "+ Producto" : "Cerrar";
  $("addBtn").setAttribute("aria-label", hidden ? "Producto nuevo" : "Cerrar");
  if (!hidden) $("nName").focus();
};
$("create").onclick = async function () {
  $("createErr").textContent = "";
  if (!$("nName").value.trim()) {
    $("createErr").textContent = "Escribí el nombre del producto.";
    $("nName").focus();
    return;
  }
  try {
    await api("/v1/phone/product", {
      method: "POST",
      body: {
        name: $("nName").value,
        barcode: $("nBarcode").value,
        price: Number(String($("nPrice").value).replace(",", ".")) || 0,
        cost: Number(String($("nCost").value).replace(",", ".")) || 0,
        stock: Number(String($("nStock").value).replace(",", ".")) || 0
      }
    });
    $("nName").value = "";
    $("nBarcode").value = "";
    $("nPrice").value = "";
    $("nCost").value = "";
    $("nStock").value = "0";
    $("createBox").classList.add("hidden");
    $("addBtn").textContent = "+ Producto";
    releaseFocus();
    await load();
    toast("Producto agregado. Llega a la compu si WalQo está abierto.");
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
      var delta = Number(btn.getAttribute("data-d"));
      var countEl = card ? card.querySelector(".count") : null;
      var before = countEl ? Number(String(countEl.textContent).replace(",", ".")) || 0 : 0;
      paintLiveStock(card, before + delta);
      try {
        await api("/v1/phone/stock", {
          method: "POST",
          body: { sync_id: id, variant_sync_id: btn.getAttribute("data-var") || "", delta: delta }
        });
        await load();
      } catch (e) {
        paintLiveStock(card, before);
        toast(e.message || "No se pudo cambiar el stock", true);
      }
      return;
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
      var barcodeInput = card.querySelector("[data-barcode]");
      if (barcodeInput) body.barcode = barcodeInput.value;
      await api("/v1/phone/product", {
        method: "POST",
        body: body
      });
      releaseFocus();
      await load();
      toast("Guardado. Llega a la compu si WalQo está abierto.");
    } else if (act === "vprice") {
      var card2 = btn.closest("article");
      var vid = btn.getAttribute("data-var");
      var input = card2.querySelector('[data-price="' + vid + '"]');
      await api("/v1/phone/variant", {
        method: "POST",
        body: { product_sync_id: id, sync_id: vid, price: Number(String(input.value).replace(",", ".")) }
      });
      releaseFocus();
      await load();
      toast("Guardado. Llega a la compu si WalQo está abierto.");
    }
  } catch (e) {
    toast(e.message || "No se pudo guardar", true);
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
var chartPick = "";
function weekDayName(iso) {
  var p = String(iso || "").slice(0, 10).split("-");
  if (p.length < 3) return "";
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()] || "";
}
function pickedDay(days) {
  var pick = chartPick;
  var found = null;
  (days || []).forEach(function (d) { if (d.day === pick) found = d; });
  if (!found && days && days.length) found = days[days.length - 1];
  return found;
}
function veces(n) {
  var c = Number(n) || 0;
  return c === 1 ? "1 venta" : c + " ventas";
}
function dayCaption(chosen) {
  if (!chosen) return "Sin días cargados";
  var c = Number(chosen.count) || 0;
  return weekDayName(chosen.day) + " " + dayLabel(chosen.day) + " · $ " + money(chosen.total) + " · " + (c ? veces(c) : "sin ventas");
}
function columnChart(days, pick) {
  var max = 1;
  (days || []).forEach(function (d) { if (Number(d.total) > max) max = Number(d.total); });
  return '<div class="chart">' + (days || []).map(function (d) {
    var total = Number(d.total) || 0;
    var h = total > 0 ? Math.max(16, Math.round((total / max) * 100)) : 4;
    var cls = (d.day === pick ? "on " : "") + (total > 0 ? "has" : "empty");
    return '<button type="button" data-day="' + esc(d.day) + '" class="' + cls + '">'
      + '<span class="plot"><i style="height:' + h + '%"></i></span><em>' + weekDayName(d.day) + "</em></button>";
  }).join("") + "</div>";
}
function shareBars(rows, labelFn, valueFn, amountFn) {
  if (!rows || !rows.length) return "";
  var max = 1;
  rows.forEach(function (r) { if (Number(amountFn(r)) > max) max = Number(amountFn(r)); });
  return rows.map(function (r) {
    var w = Math.max(4, Math.round((Number(amountFn(r)) / max) * 100));
    return '<div class="line"><span>' + esc(labelFn(r)) + "</span><strong>" + valueFn(r) + '</strong></div><div class="bar"><span style="width:' + w + '%"></span></div>';
  }).join("");
}
function onChartClick(event) {
  var btn = event.target.closest ? event.target.closest("[data-day]") : null;
  if (!btn) return;
  chartPick = btn.getAttribute("data-day") || "";
  renderHome();
  if (lastReport) renderReport(lastReport);
}
function renderReport(report) {
  if (!report) {
    $("reportBody").innerHTML = '<div class="card note">Todavía no hay reportes. Abrí WalQo en la compu y esperá un momento.</div>';
    return;
  }
  var days = report.days || [];
  var chosen = pickedDay(days);
  var caption = dayCaption(chosen);
  var trend = vsYesterday(report.today_total, report.yesterday_total);
  $("reportBody").innerHTML =
    '<div class="kpis" style="margin-bottom:12px"><div class="kpi"><div class="meta">HOY</div><b>$ ' + money(report.today_total) + '</b><div class="meta">' + (Number(report.today_count) ? veces(report.today_count) : "Sin ventas") + '</div></div>'
    + '<div class="kpi"><div class="meta">AYER</div><b>$ ' + money(report.yesterday_total) + '</b><div class="meta">' + trend.text + "</div></div></div>"
    + '<div class="card"><strong>Últimos 7 días</strong><div class="meta" style="margin-top:4px">' + caption + "</div>" + columnChart(days, chosen ? chosen.day : "") + "</div>"
    + '<div class="card"><strong>Métodos de pago · hoy</strong>' + (shareBars(report.payments, function (r) { return payName(r.method) + " · " + r.count; }, function (r) { return "$ " + money(r.total); }, function (r) { return r.total; }) || '<p class="note">Nada en este período.</p>') + "</div>"
    + '<div class="card"><strong>Por empleado · hoy</strong>' + lines(report.employees, function (r) { return r.name + " · " + r.count; }, function (r) { return "$ " + money(r.total); }) + "</div>"
    + '<div class="card"><strong>Top productos · hoy</strong>' + (shareBars(report.top_products, function (r) { return r.name; }, function (r) { return qty(r.qty); }, function (r) { return r.qty; }) || '<p class="note">Nada en este período.</p>') + "</div>"
    + '<div class="card"><strong>Para pedir</strong>' + lines(report.low_stock, function (r) { return r.name; }, function (r) { return qty(r.stock) + " / mín " + qty(r.min_stock); }) + "</div>"
    + '<div class="card"><strong>Últimas ventas</strong>' + lines(report.recent_sales, function (r) { return dayLabel(r.at) + " " + String(r.at || "").slice(11, 16) + " · " + payName(r.payment_method); }, function (r) { return "$ " + money(r.total); }) + "</div>";
  $("reportBody").onclick = onChartClick;
}
async function loadReports() {
  busy(true);
  try {
    var data = await api("/v1/reports");
    lastReport = data.report || null;
    reportState = lastReport ? "ready" : "empty";
    renderReport(lastReport);
    renderHome();
  } catch (e) {
    reportState = lastReport ? "ready" : "error";
    renderHome();
    throw e;
  } finally {
    busy(false);
  }
}
var lastReport = null;
var reportState = "loading";
var screen = "home";
var cart = [];
var payMethod = "efectivo";
var paidInput = "";
var scanMode = "stock";
function cartTotal() {
  var t = 0;
  cart.forEach(function (i) { t += i.qty * i.price; });
  return Math.round(t * 100) / 100;
}
function paintCartCount() {
  var n = 0;
  cart.forEach(function (i) { n += i.qty; });
  if ($("cartCount")) {
    $("cartCount").textContent = String(n);
    $("cartCount").classList.toggle("hidden", n < 1);
  }
  if ($("cartPreview")) $("cartPreview").textContent = "$ " + money(cartTotal());
  if ($("openCart")) $("openCart").setAttribute("aria-label", "Carrito, " + n + " productos, $ " + money(cartTotal()));
}
function addToCart(p, variant) {
  var variantId = variant ? variant.sync_id : "";
  var key = p.sync_id + "|" + variantId;
  var price = variant && variant.price != null ? variant.price : p.price;
  var name = variant ? p.name + " · " + (variant.label || "Modelo") : p.name;
  var found = null;
  cart.forEach(function (i) { if (i.key === key) found = i; });
  if (found) found.qty += 1;
  else cart.push({ key: key, sync_id: p.sync_id, variant_sync_id: variantId, name: name, price: Number(price) || 0, qty: 1 });
  paintCartCount();
}
function renderSell() {
  var q = ($("sellQ").value || "").trim().toLowerCase();
  var html = "";
  catalog.forEach(function (p) {
    var blob = (p.name || "") + " " + (p.barcode || "") + " " + (p.sku || "");
    (p.variants || []).forEach(function (v) { blob += " " + (v.label || "") + " " + (v.sku || "") + " " + (v.barcode || ""); });
    if (q && blob.toLowerCase().indexOf(q) < 0 && !productHitsCode(p, q)) return;
    if (p.has_variants && (p.variants || []).length) {
      (p.variants || []).forEach(function (v) {
        var price = v.price != null ? v.price : p.price;
        html += '<button type="button" class="pcard" data-act="addcart" data-id="' + esc(p.sync_id) + '" data-var="' + esc(v.sync_id) + '" style="text-align:left">'
          + '<div class="pname">' + esc(v.label || "Modelo") + "</div>"
          + '<div class="meta">' + esc(p.name) + "</div>"
          + '<div class="price">$ ' + money(price) + "</div>"
          + '<div class="pmeta">Stock: ' + qty(v.stock) + "</div></button>";
      });
    } else {
      html += '<button type="button" class="pcard" data-act="addcart" data-id="' + esc(p.sync_id) + '" data-var="" style="text-align:left">'
        + '<div class="pname">' + esc(p.name) + "</div>"
        + '<div class="price">$ ' + money(p.price) + "</div>"
        + '<div class="pmeta">Stock: ' + qty(p.stock) + "</div></button>";
    }
  });
  $("sellList").innerHTML = html
    ? '<div class="grid">' + html + "</div>"
    : '<div class="card note">' + (q ? "No hay un producto con esa búsqueda." : "No hay productos para vender.") + "</div>";
}
function payButtons() {
  var methods = [
    ["efectivo", "Efectivo"],
    ["débito", "Débito"],
    ["transferencia", "Transfer"],
    ["fiado", "Fiado"]
  ];
  return methods.map(function (m) {
    return '<button type="button" data-pay="' + m[0] + '"' + (payMethod === m[0] ? ' class="on"' : "") + ">" + m[1] + "</button>";
  }).join("");
}
function cashChips(total) {
  var list = [total];
  var thou = Math.ceil(total / 1000) * 1000;
  var five = Math.ceil(total / 5000) * 5000;
  if (thou > total + 0.001) list.push(thou);
  if (five > thou + 0.001) list.push(five);
  return list.map(function (n) {
    return '<button type="button" data-chip="' + n + '">$ ' + money(n) + "</button>";
  }).join("");
}
function renderCart() {
  paintCartCount();
  if (!cart.length) {
    $("cartBody").innerHTML = '<div class="cart-card note">El carrito está vacío.</div>';
    return;
  }
  var total = cartTotal();
  var lines = cart.map(function (i) {
    return '<div class="cart-line"><div class="grow"><div class="name">' + esc(i.name) + "</div>"
      + '<div class="meta">$ ' + money(i.price) + " / unidad</div></div>"
      + '<div class="qtybox"><button type="button" data-cqty="' + esc(i.key) + '" data-d="-1">−</button><span>' + qty(i.qty) + '</span><button type="button" data-cqty="' + esc(i.key) + '" data-d="1">+</button></div>'
      + '<strong>$ ' + money(i.qty * i.price) + "</strong></div>";
  }).join("");
  var cash = payMethod === "efectivo"
    ? '<div class="meta" style="margin:8px 0 4px">EFECTIVO RECIBIDO</div><input id="paidBox" inputmode="decimal" value="' + esc(paidInput) + '" />'
      + '<div class="chips" style="margin-top:8px">' + cashChips(total) + "</div>"
    : "";
  $("cartBody").innerHTML = '<div class="cart-card"><div class="meta">' + cart.length + " ítems</div>" + lines + "</div>"
    + '<div class="cart-card"><div class="sum"><span>Subtotal</span><span>$ ' + money(total) + "</span></div>"
    + '<div class="sum big"><span>TOTAL</span><span>$ ' + money(total) + "</span></div></div>"
    + '<div class="cart-card"><div class="meta">MÉTODO DE PAGO</div><div class="pays" style="margin-top:8px">' + payButtons() + "</div>" + cash + "</div>"
    + '<p id="cartErr" class="err"></p>'
    + '<div class="payrow"><button type="button" class="ghost" data-go="sell">Volver</button>'
    + '<button type="button" class="cobrar" id="cobrar">Cobrar $ ' + money(total) + "</button></div>";
  var box = $("paidBox");
  if (box) box.oninput = function () { paidInput = box.value; };
}
function vsYesterday(today, yesterday) {
  var a = Number(today) || 0;
  var b = Number(yesterday) || 0;
  if (a === 0 && b === 0) return { cls: "", text: "Todavía sin ventas" };
  if (b === 0) return { cls: "up", text: "Sin ventas ayer" };
  var pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return { cls: "", text: "Igual que ayer" };
  return { cls: pct > 0 ? "up" : "down", text: (pct > 0 ? "+" : "") + pct + "% vs ayer" };
}
function renderHome() {
  var box = $("homeBody");
  if (!box) return;
  if (!lastReport) {
    box.innerHTML = reportState === "error"
      ? '<div class="card note">No se pudieron cargar los números. Revisá la conexión y que WalQo esté abierto en la compu.</div>'
      : reportState === "empty"
        ? '<div class="card note">Todavía no llegaron los números. Abrí WalQo en la compu y esperá un momento.</div>'
        : '<div class="card note">Cargando los números…</div>';
    return;
  }
  var report = lastReport;
  var days = report.days || [];
  var chosen = pickedDay(days);
  var trend = vsYesterday(report.today_total, report.yesterday_total);
  var hasSales = Number(report.today_count) > 0;
  var avg = hasSales ? Number(report.today_total) / Number(report.today_count) : 0;
  var low = (report.low_stock || []).length;
  var caption = dayCaption(chosen);
  var countLine = hasSales ? veces(report.today_count) + " · " + trend.text : trend.text;
  var pay = shareBars(report.payments, function (r) { return payName(r.method); }, function (r) { return "$ " + money(r.total); }, function (r) { return r.total; });
  var top = shareBars((report.top_products || []).slice(0, 5), function (r) { return r.name; }, function (r) { return qty(r.qty); }, function (r) { return r.qty; });
  var recent = (report.recent_sales || []).slice(0, 4);
  box.innerHTML =
    '<div class="hero-stat"><div class="meta">VENTAS DE HOY</div><b>$ ' + money(report.today_total) + '</b>'
    + '<div class="delta ' + trend.cls + '">' + countLine + "</div></div>"
    + '<div class="card"><strong>Últimos 7 días</strong><div class="meta" style="margin-top:4px">' + caption + "</div>" + columnChart(days, chosen ? chosen.day : "") + "</div>"
    + '<div class="kpis" style="margin-bottom:12px">'
    + '<div class="kpi"><div class="meta">TICKET PROMEDIO</div><b>' + (hasSales ? "$ " + money(avg) : "—") + '</b><div class="meta">' + (hasSales ? "hoy" : "sin ventas") + "</div></div>"
    + '<div class="kpi"><div class="meta">BAJO STOCK</div><b>' + low + '</b><div class="meta">' + (low ? "para pedir" : "ninguno bajo el mínimo") + "</div></div>"
    + "</div>"
    + '<div class="card"><strong>Pagos de hoy</strong>' + (pay || '<p class="note">Todavía no hay pagos hoy.</p>') + "</div>"
    + '<div class="card"><strong>Más vendidos hoy</strong>' + (top || '<p class="note">Todavía no hay productos vendidos hoy.</p>') + "</div>"
    + (low ? '<div class="card"><strong>Para pedir</strong>' + lines((report.low_stock || []).slice(0, 4), function (r) { return r.name; }, function (r) { return qty(r.stock) + " / mín " + qty(r.min_stock); }) + "</div>" : "")
    + (recent.length ? '<div class="card"><strong>Últimas ventas</strong>' + lines(recent, function (r) { return dayLabel(r.at) + " " + String(r.at || "").slice(11, 16) + " · " + payName(r.payment_method); }, function (r) { return "$ " + money(r.total); }) + "</div>" : "");
  box.onclick = onChartClick;
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
  var sell = which === "sell";
  var cartOn = which === "cart";
  $("homeView").classList.toggle("hidden", !home);
  $("productsView").classList.toggle("hidden", !products);
  $("reportsView").classList.toggle("hidden", !reports);
  $("sellView").classList.toggle("hidden", !sell);
  $("cartView").classList.toggle("hidden", !cartOn);
  var menu = $("menuBtn");
  if (menu) menu.classList.toggle("hidden", home);
  var leave = $("leave");
  if (leave) leave.classList.toggle("hidden", !home);
  var title = $("screenTitle");
  if (title) title.textContent = home ? "Inicio" : reports ? "Reportes" : cartOn ? "Carrito" : sell ? "Vender" : "Inventario";
  var mark = which === "new" ? "products" : which === "cart" ? "sell" : which;
  var buttons = document.querySelectorAll("#drawer button, #tabbar button");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle("on", buttons[i].getAttribute("data-go") === mark);
  }
  closeMenu();
  window.scrollTo(0, 0);
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
  if (sell) renderSell();
  if (cartOn) renderCart();
  if (products || home || sell) load().catch(function () {});
}
$("menuBtn").onclick = function () {
  $("drawer").classList.toggle("hidden");
  $("backdrop").classList.toggle("hidden");
};
$("backdrop").onclick = closeMenu;
$("drawerLeave").onclick = function () { logout(); };
document.addEventListener("click", function (ev) {
  var go = ev.target.closest("[data-go]");
  if (!go) return;
  showScreen(go.getAttribute("data-go"));
});
var ua = navigator.userAgent || "";
var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
var standalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
if (ios && !standalone && !nativeApp()) {
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
if (!nativeApp() && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(function () {});
}
if (token) {
  showApp(true);
  showScreen("home");
}
setInterval(function () {
  if (!token || document.hidden) return;
  if (screen === "products" || screen === "sell") load().catch(function () {});
  else loadReports().catch(function () {});
}, 8000);
</script>
</body>
</html>`;
