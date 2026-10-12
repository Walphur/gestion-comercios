# WalQo

## Objetivo
Que el comercio venda, controle el stock y atienda turnos desde la computadora, y que lo cargado en el celular o en la web quede guardado y entre en WalQo cuando el programa está abierto.

<!-- walplan:scope:start -->
## Alcance
producto
<!-- walplan:scope:end -->

## Restricciones
- No cambiar la matemática de ventas, precios, stock ni los identificadores de pago
- La interfaz va en español
- Ninguna pantalla genera scroll horizontal
- Una venta o un turno del celular queda en el servidor al confirmarse y se anota en la PC cuando WalQo está abierto
- No inventar certificados ni credenciales
- No ampliar la infraestructura de tests salvo un bug o una función nueva

## Stack
Elegido: React 19, TypeScript, Vite 7, Tailwind 4, Tauri 2, Rust y SQLite en la PC; Cloudflare Workers para el celular, los turnos web, las licencias y walqo.pro
También se detectó: Node, React, Vite, TypeScript.
Carpetas: apps, branding, docs, public, scripts, src, src-tauri, tests, updater, workers

<!-- walplan:features:start -->
## Funcionalidades
- Punto de venta, caja y arqueo
- Productos, stock, códigos de barras y rubros
- Clientes, fiado y cuenta corriente
- Reportes del local
- Turnos, órdenes, presupuestos y remitos del plan Pro
- Catálogo y ventas del celular, aplicados en la PC cuando WalQo está abierto
- Reserva pública de turnos de estética, guardada en el servidor y bajada a la agenda al abrir la PC
- Carta pública y consulta de taller en walqo.pro
- Licencias, facturación, Mercado Pago y Tienda Nube
- Sincronización entre computadoras del mismo local
<!-- walplan:features:end -->

<!-- walplan:decisions:start -->
## Decisiones
- 2026-10-12 — Stack elegido: React 19, TypeScript, Vite 7, Tailwind 4, Tauri 2, Rust y SQLite en la PC; Cloudflare Workers para el celular, los turnos web, las licencias y walqo.pro. En el repositorio también está: Node, React, Vite, TypeScript
<!-- walplan:decisions:end -->
