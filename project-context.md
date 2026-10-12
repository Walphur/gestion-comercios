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
- 2026-10-12 — En estética, el alta manual distingue servicio, insumo y producto. El servicio puede llevar insumos. Presupuesto y remito quedan opcionales en ese rubro.
- 2026-10-12 — Cada rubro deja en el menú solo sus módulos. El resto sigue en Configuración, apagado, y se puede prender.
- 2026-10-12 — Estética y clínica separan productos y servicios. Turnos y trabajos usan esos servicios. El cliente de salón o clínica guarda DNI, domicilio, nacimiento y, si aplica, obra social.
- 2026-10-12 — Un servicio no pide código, vencimiento, marca ni combo. La reserva pública junta día y horario, y puede asignar cualquier profesional que esté libre.
- 2026-10-12 — El enlace de turnos puede ser walqo.pro/NombreDelLocal. El enlace con código sigue sirviendo. La reserva pública muestra los cinco pasos con el resumen separado y confirma recién cuando el servidor acepta.
- 2026-10-12 — En taller, Servicios queda junto a Productos. Un servicio es mano de obra, sin código ni stock; el repuesto sigue en Productos.
- 2026-10-12 — Las ventas se filtran por día, pago, cajero y estado. Desde el historial del cliente se corrige una venta vieja. En kiosco ese historial no muestra reparaciones.
- 2026-10-12 — Cada servicio puede tener duración y quién lo hace. El turnero ofrece horarios según esa duración y solo con ese personal.
<!-- walplan:decisions:end -->
