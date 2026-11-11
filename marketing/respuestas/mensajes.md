# Respuestas para cuando preguntan por WalQo

Para Marketplace, WhatsApp e Instagram. Copiá el texto y mandá la imagen que dice al lado.
Las imágenes están en esta carpeta. Para volver a armarlas: `node scripts/build-respuestas-consultas.mjs`.

## 1. Primer mensaje («hola, me das más info?»)

> ¡Hola! Sí, claro 😊 WalQo es un sistema para el local: cobrás rápido, controlás el stock, llevás el fiado y sabés cuánto vendiste en el día. Funciona aunque se corte internet.
> ¿Qué tipo de negocio tenés? Así te cuento lo que te sirve a vos.

Imagen: `01-que-es-walqo.jpg`

## 2. Cuando dicen el rubro

Mandá el texto del rubro y la imagen `rubro-…`. Después, el de precios (punto 3).

**Kiosco, almacén, verdulería, carnicería, panadería** → `rubro-almacen-verduleria-kiosco.jpg`

> ¡Genial! Para almacén y verdulería te sirve un montón:
> • Vendés por kilo o por importe («$2.000 de papa») y calcula solo.
> • Pasás el lector de código de barras y el producto entra a la venta.
> • Cobrás en efectivo, débito, transferencia o QR de Mercado Pago.
> • Llevás el fiado de cada cliente, con fecha y detalle.
> • El stock se descuenta solo y te avisa lo que se está terminando.
> • Al cerrar ves cuánto vendiste y cuánta plata tiene que haber en la caja.
> Lo podés probar 7 días gratis con todo.

**Restó, bar, rotisería, pizzería** → `rubro-gastronomia.jpg`

> ¡Buenísimo! Para gastronomía tenés mesas con su cuenta, comandas que salen directo a cocina y cobro por la caja. Cada mesa tiene su QR para que el cliente vea la carta, pida o pida la cuenta, y los mozos toman el pedido con el celular, sin instalar nada. Lo podés probar 7 días gratis con todo.

**Peluquería, barbería, estética, uñas** → `rubro-peluqueria.jpg`

> ¡Genial! Tus clientes sacan turno solos desde el celular con tu link, sin bajar ninguna app. Tenés la agenda de cada profesional, cobrás desde el turno (el servicio y los productos en la misma venta) y ves cuánto le toca a cada uno de comisión. Lo podés probar 7 días gratis con todo.

**Ropa, ferretería, pet shop, librería, bazar** → `rubro-ropa-ferreteria-petshop.jpg`

> ¡Buenísimo! Tenés el stock siempre al día, etiquetas con precio, subas de precio por categoría o proveedor y lo que le debés a cada proveedor. Además tenés tu tienda online en walqo.pro/tulocal: el cliente arma el pedido y te llega a la caja. Lo podés probar 7 días gratis con todo.

**Celulares y electrónica** → `rubro-celulares.jpg`

> ¡Genial! Cada equipo queda con su IMEI y la garantía sale sola al vender. Manejás precios en dólares (automático o fijo, con tu margen), tomás usados en parte de pago, reservás equipos y llevás el servicio técnico. Lo podés probar 7 días gratis con todo.

**Taller mecánico, lubricentro, gomería** → `rubro-taller.jpg`

> ¡Buenísimo! Armás órdenes de trabajo por patente con repuestos y mano de obra, hacés presupuestos y los mandás por WhatsApp, y el cliente consulta cómo va su auto con la patente o el DNI. Para taller va el plan Pro. Lo podés probar 7 días gratis con todo.

**Consultorio, clínica, odontología, kinesiología** → `rubro-consultorio.jpg`

> ¡Genial! Tenés la agenda de cada profesional, los pacientes sacan turno desde el celular y la recepción ve a quién llamar. Cada paciente con su obra social y notas internas, y ficha dental para odontología. Para consultorios va el plan Pro. Lo podés probar 7 días gratis con todo.

**Supermercado o varias cajas**

> ¡Buenísimo! Para súper va el plan Pro: hasta 3 cajas sincronizadas con un solo stock, venta por peso y lector de código de barras. Lo podés probar 7 días gratis con todo.

## 3. Precios («¿cuánto sale?») → `02-planes-y-precios.jpg`

> Los primeros 7 días tenés todo gratis. Después elegís:
> • **Completo: $35.000 por mes** (el más elegido). Trae todo: Mercado Pago, factura electrónica, tienda web, app del celular, 2 PCs y actualizaciones.
> • **Permanente: $12.000, pago único.** Lo básico: caja, stock y fiado, en 1 PC y hasta 1.000 productos, sin actualizaciones.
> • **Pro: $60.000 por mes**, para súper, talleres y consultorios (3 PCs).
> Pagando 3 meses tenés 10% menos, y pagando el año te cobro 10 meses.
> Si no renovás no se borra nada: queda en el plan gratis.

## 3b. Qué trae cada plan («¿qué contiene cada plan?») → `02b-que-trae-cada-plan.jpg`

> Te paso lo que trae cada uno 👇
>
> 🆓 **Gratis ($0):** para probar con pocas cosas. Hasta 25 productos y 50 ventas por mes, en 1 PC. Tiene caja, stock, fiado, reportes, proveedores y tienda web, pero sin Mercado Pago ni factura electrónica.
>
> 💾 **Permanente ($12.000, pago único):** lo básico para siempre. Caja, stock, fiado y código de barras, en 1 PC, con hasta 1.000 productos, el dueño y 1 cajero. No trae reportes por fechas, proveedores, gastos, etiquetas, tienda web, app del celular, Mercado Pago ni factura, y no recibe actualizaciones.
>
> ⭐ **Completo ($35.000 por mes, el más elegido):** todo sin tope de productos ni de ventas, en 2 PCs y con los usuarios que quieras. Suma QR de Mercado Pago, factura electrónica de ARCA, tienda web, app del celular, reportes con la ganancia, proveedores, gastos, etiquetas, subas de precio en cantidad, catálogo de 200 mil productos, actualizaciones y ayuda por WhatsApp.
>
> 🚀 **Pro ($60.000 por mes):** lo del Completo en 3 PCs, más turnos, presupuestos, remitos y órdenes de trabajo. Es para súper, talleres, consultorios y peluquerías de más de 2 profesionales.
>
> Pagando 3 meses tenés 10% menos, y el año te sale 10 meses. Los primeros 7 días tenés todo para probarlo.

## 4. Cómo empezar («¿cómo lo pruebo?») → `03-como-empezar.jpg`

> Entrás a **walqo.pro** y lo descargás en la PC del local (Windows 10 u 11), o lo usás desde el navegador en walqo.pro/web. Elegís tu rubro y ya viene con ejemplos.
> Tenés 7 días con todo. Si te gusta, me escribís y te paso la licencia. Si te trabás, te ayudo por acá, también a cargar los productos.

## 5. Preguntas que se repiten

**¿Necesita internet?**
> En la PC funciona sin internet: si se corta, seguís vendiendo. Internet hace falta para activarlo, la tienda web, Mercado Pago y la factura electrónica.

**¿Anda en el celular / en Mac?**
> Se instala en una PC con Windows 10 u 11. Si no tenés, lo usás desde el navegador en walqo.pro/web, también desde el celular o la tablet.

**¿Hace factura electrónica?**
> Sí, con WalQo Completo hacés la factura electrónica de ARCA. Necesitás tu CUIT y un punto de venta habilitado.

**¿Se conecta con Mercado Pago?**
> Sí, cobrás con el QR de Mercado Pago desde la caja, y la tienda web también puede cobrar con Mercado Pago.

**¿Lo puedo usar en dos computadoras?**
> Con WalQo Completo, en 2 PCs del mismo local, sincronizadas. Con Pro, en 3.

**¿Cómo pago?**
> Te paso los datos para pagar y, apenas se acredita, te mando la clave. Queda activado en el momento, con todo lo que ya cargaste en la prueba.

**«Lo voy a pensar» / no responde (al día siguiente)**
> ¡Hola! ¿Pudiste mirarlo? Si querés lo instalamos juntos, son 10 minutos, y lo usás 7 días gratis con tus productos. Cualquier duda me decís 🙌
