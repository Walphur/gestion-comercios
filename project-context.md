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
- 2026-10-12 — El sábado y el domingo pueden tener otro horario de turnos. En el celular, Instalar en iPhone queda siempre a la vista.
- 2026-10-12 — walqo.pro/celular muestra un video de cómo instalar el ícono en el iPhone.
- 2026-10-13 — Al confirmar un turno, el mismo DNI (o el teléfono si no hay DNI) reutiliza el cliente de ese local. En taller, la misma patente se reutiliza y solo se actualiza el kilometraje. Una patente de otro cliente no se duplica ni se reasigna. Peluquería y estética no piden vehículo ni obra social.
- 2026-10-13 — En la agenda de clínica primero se elige el servicio y después solo los profesionales habilitados para ese servicio. El guardado rechaza otra combinación, un horario fuera de atención y un turno que se pisa. El taller sigue pidiendo el vehículo.
- 2026-10-13 — En clínica el menú deja adelante pacientes, obras sociales, servicios y turnos. Productos, stock, caja, facturación, reportes y sugerencias no salen en el día a día. La planilla de obras sociales sale de la ficha del paciente.
- 2026-10-13 — En clínica, la agenda del profesional muestra solo los turnos de quien se elige, con una nota interna de esa atención. La factura y la receta se abren en otra app si cargan el enlace. No es receta electrónica ni historia clínica oficial.
- 2026-10-13 — En clínica el inicio muestra a quién llamar, los turnos del día y los servicios con su profesional. Servicios no abre el catálogo de productos.
- 2026-10-13 — En clínica el listado de pacientes muestra contacto, DNI y obra social, sin deuda ni cobro. Desde la ficha se marca el odontograma de adultos. Es una ficha interna, no una historia clínica ni una liquidación.
- 2026-10-15 — walqo.pro carga el chat de Unibox en el sitio comercial, las guías y las páginas legales. No aparece en turnos, carta, taller ni la app del celular.
- 2026-10-15 — walqo.pro suma una página por rubro con preguntas frecuentes, enlazada desde Software para comercios y el sitemap. La campaña de Google Ads queda en marketing/google-ads y no se publica.
- 2026-10-19 — En peluquería y estética cada profesional tiene un porcentaje por servicios y otro por productos. La venta guarda quién atendió y de qué turno viene. Comisiones calcula sobre lo cobrado con el descuento, sin propinas ni ventas anuladas. «Cobrar» en la agenda o en el turno pasa el servicio a la caja.
- 2026-10-19 — El primer arranque ofrece ejemplos según el rubro: en peluquería, servicios con duración y productos de reventa. Los rubros de servicios no ven el catálogo de supermercado. El selector de profesional muestra a todos sin escribir.
- 2026-10-19 — Una instalación nueva sin cuenta ni ventas pide crear la cuenta (email y contraseña) tanto para la prueba Pro como para el plan gratis, aunque pasen más de 24 horas. El registro va en cuatro pasos: negocio, rubro, preguntas opcionales y cuenta. Las respuestas quedan en la PC y en el servidor de licencias.
- 2026-10-19 — El turnero y la carta se comparten como walqo.pro/NombreDelLocal y se abren en el navegador, sin descargar nada. En la pantalla del celular, el enlace para clientes va arriba y el código de la app queda para el personal. Si el nombre no es un turnero, la misma dirección abre la carta.
- 2026-10-19 — Inicio muestra «Arrancá con WalQo»: los pasos que faltan según el rubro, detectados con lo que ya se cargó, y primero lo que el comercio eligió resolver al registrarse. El ? de la barra de abajo abre tips de la pantalla actual y Ayuda junta todo con búsqueda, el plan y WhatsApp. No hay recorrido paso a paso con burbujas.
- 2026-10-19 — Proveedores tiene cuenta corriente: la compra a cuenta suma deuda y el pago la baja. El pago con efectivo del cajón sale como egreso de la caja abierta; sin caja abierta no se ofrece. El Ingreso compra pide proveedor y cómo se pagó. Pedidos para reponer arma por proveedor lo que está bajo el mínimo o se agotó y se vende, lo manda por WhatsApp y al llegar abre el ingreso ya cargado. Cuentas y pedidos no se sincronizan entre computadoras.
- 2026-10-19 — Al abrir WalQo después de actualizar se muestra «Novedades de WalQo»: lo nuevo, las mejoras y los arreglos en una frase simple cada uno, con un botón para ir a la pantalla. Se ve una vez por versión en cada PC y queda en Ayuda. Una instalación nueva no lo ve. Cada release suma su texto en src/config/changelog.ts.
- 2026-10-19 — Pagando el año de una vez se cobran 10 meses y se usan 12 (Completo $350.000, Pro $600.000). El pago anual se carga desde el panel de licencias y nunca es parcial.
- 2026-10-19 — Se suma el pago trimestral: 3 meses juntos con 10% menos (Completo $94.500, Pro $162.000), 90 días. El anual sigue en 12 meses por 10. Completo de $35.000 queda con todo incluido (ARCA, Tienda Nube). Más adelante, evaluar un plan de $25.000 sin ARCA ni Tienda Nube y con 1 PC.
- 2026-10-19 — No hay plan «Completo Salón»: solo WalQo Completo ($35.000) y Pro ($60.000). Una peluquería, barbería o estética de hasta 2 profesionales va con WalQo Completo, con turnos y comisiones (por dentro, licencia Pro mensual de 2 PCs). Con más de 2 profesionales, Pro (3 PCs). En ese rubro, la licencia Pro mensual con 1 o 2 PCs deja tener hasta 2 profesionales activos: no deja sumar un tercero y ofrece WhatsApp de ventas; los que ya estaban no se tocan.
- 2026-10-19 — El enlace walqo.pro/NombreDelLocal es del comercio, no del celular. Desvincular solo cierra los celulares: la PC sigue unida a la misma cuenta y el enlace no cambia. Si la PC pierde ese vínculo, la cuenta nueva del mismo comercio (identificado por la licencia) hereda el nombre, y los enlaces y códigos viejos siguen abriendo la misma agenda. Si el nombre ya lo usa otro comercio, no se le suman números: la app pide elegir otro, de letras y números. El turnero toma los servicios de la agenda que manda la PC, con nombre y precio, sin esperar la subida del catálogo; esa subida empieza por los servicios.
- 2026-10-19 — Un presupuesto se puede editar mientras no se haya cobrado como venta. Borrador y enviado se editan directo; aprobado y rechazado se abren con «Editar» y guardan con el mismo número y el mismo estado. Uno cobrado no se toca (ya movió venta, caja y stock): «Duplicar y editar» arma uno nuevo con los mismos ítems. Si ya tenía una orden de servicio, la orden no cambia sola y se avisa.
- 2026-10-19 — Gastos tiene su pantalla, para el dueño y el encargado: alquiler, luz, sueldos y demás, con gastos fijos que avisan si faltan cargar este mes. La mercadería no va ahí: va por Proveedores y ya cuenta en el costo de lo vendido. El gasto con efectivo del cajón sale como egreso de la caja abierta; sin caja abierta no se ofrece. Anular saca el egreso si esa caja sigue abierta; si ya se cerró, no la toca y avisa. Reportes suma «Resultado» (ventas menos costo de lo vendido menos gastos: ganancia real estimada, solo para quien ve ganancias), fechas Desde y Hasta, filtro por cajero, imprimir o PDF, y clientes que deben, stock valorizado y deuda con proveedores. Los gastos son de todo el local y no se sincronizan entre computadoras.
<!-- walplan:decisions:end -->
