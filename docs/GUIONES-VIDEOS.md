# Cómo grabar los videos + guiones

## Con qué grabar (recomendado)

| Herramienta | Para qué | Costo |
|-------------|----------|-------|
| **OBS Studio** | Grabar pantalla + tu voz | Gratis — https://obsproject.com |
| **YouTube** | Subir y enlazar en ayuda.html | Gratis |
| (Opcional) **CapCut** | Recortar errores, intro de 3 seg | Gratis |

### Configuración OBS (una sola vez)

1. Instalá OBS → **Ajustes → Salida** → calidad **1080p**, formato **mp4**.
2. **Fuentes** → **Captura de pantalla** (toda la pantalla o solo la ventana de Gestión Comercios).
3. **Fuentes** → **Entrada de audio** → tu micrófono.
4. Probá: **Iniciar grabación** 10 segundos y escuchá el audio.
5. Antes de cada video: cerrá WhatsApp/notificaciones, app en **tema claro** (se ve mejor), zoom Windows al **100%**.

### Subir a YouTube

1. Título: `Gestión Comercios — [nombre del video] | Waltech`
2. Descripción: link de descarga `https://github.com/Walphur/gestion-comercios/releases/latest` + WhatsApp soporte.
3. Visibilidad: **No listado** (solo quien tiene el link de ayuda) o **Público** si querés que aparezca en Google.
4. Copiá el link y pegalo en `docs/legal/ayuda.html` reemplazando el texto "próximamente".

---

## Video 1 — Instalar y activar (5–6 min)

**Título YouTube:** Gestión Comercios — Instalar y activar licencia | Waltech

### Qué mostrar en pantalla
1. GitHub Releases → descargar `.exe`
2. Instalador → Siguiente → Instalar
3. Abrir app → pantalla de licencia → pegar clave `GC-…`
4. Primer inicio → elegir rubro kiosco (si aparece asistente)

### Guion (decí esto)

> Hola, soy [tu nombre] de Waltech. En este video vas a instalar Gestión Comercios en tu PC con Windows 10 u 11.
>
> Primero entrá a GitHub en el link que te mandamos y descargá el instalador, el archivo que termina en **setup.exe**.
>
> Doble clic, **Siguiente**, **Instalar**. Puede tardar un minuto.
>
> Abrís la app. La primera vez te pide la **clave de licencia**, empieza con **GC-**. La copiás del mensaje de compra y pegás acá. **Activar**.
>
> Se vincula a **esta PC sola**. Si cambiás de computadora, escribinos por WhatsApp.
>
> Listo. Elegí tu rubro — por ejemplo **Kiosco** — y seguí el asistente si querés cargar productos de ejemplo o empezar vacío.
>
> Cualquier duda: WhatsApp +54 9 266 503-1950. En el centro de ayuda tenés más videos.

---

## Video 2 — Primera venta / POS (6–7 min)

**Título YouTube:** Gestión Comercios — Primera venta en el POS | Waltech

### Qué mostrar
1. **Caja** → Abrir turno
2. **Punto de venta** → buscar producto o escanear código
3. Cobrar **efectivo** (monto pagado, vuelto)
4. Segunda venta con **tarjeta** o **Mercado Pago** si tenés
5. **Ventas** → ver el comprobante

### Guion

> Vamos a hacer tu primera venta.
>
> Antes de cobrar, andá a **Caja** y tocá **Abrir turno**. Sin turno abierto no podés vender.
>
> Entrá a **Punto de venta**. Buscá un producto por nombre o escaneá el código de barras con el lector.
>
> Se agrega al carrito. Si son varios, seguí escaneando.
>
> Elegí **Efectivo**, poné cuánto te pagaron y el sistema calcula el vuelto. **Cobrar**.
>
> Listo, venta registrada. Podés hacer otra con **tarjeta** o el medio que uses.
>
> En **Ventas** ves el historial del día.
>
> Eso es todo para empezar a cobrar en el mostrador.

---

## Video 3 — Cargar productos / Excel (5–6 min)

**Título YouTube:** Gestión Comercios — Importar productos desde Excel | Waltech

### Qué mostrar
1. **Productos** → **Importar** → pestaña Excel
2. Archivo de ejemplo con columnas nombre, código, precio
3. Opción "actualizar si existe"
4. (Opcional) pestaña **Catálogo supermercado** → importar categorías

### Guion

> En **Productos** tenés tres formas de cargar: a mano, Excel, o el catálogo grande de supermercado que ya viene en tu plan.
>
> Para tu lista propia: **Importar** → **Tu Excel o CSV**.
>
> El archivo tiene que tener al menos **nombre** o **código de barras**. Opcional: precio, costo, stock, categoría.
>
> Elegís el archivo, marcá **Actualizar si el código ya existe** si estás refrescando precios, y **Importar**.
>
> En unos segundos tenés todo en la lista. Buscá uno para comprobar.
>
> Si querés el catálogo de ~200 mil productos, misma pantalla → pestaña **Catálogo supermercado**. Elegís categorías o todo. La primera vez puede tardar 15–20 minutos.
>
> Cualquier error, mandanos captura por WhatsApp.

---

## Video 4 — Caja: abrir y cerrar (5 min)

**Título YouTube:** Gestión Comercios — Abrir y cerrar caja | Waltech

### Qué mostrar
1. Abrir turno
2. Registrar un egreso (ej. pago proveedor)
3. Cierre con arqueo ciego → contar efectivo
4. Mensaje de backup generado
5. (Opcional) carpeta de backup / nube

### Guion

> La **Caja** es el turno del día.
>
> Al arrancar: **Caja** → **Abrir turno**. A partir de ahí todas las ventas quedan en ese turno.
>
> Si sacás plata para un proveedor o entra cambio, registrá **Egreso** o **Ingreso** en la misma pantalla.
>
> Al cerrar, **Cierre con arqueo ciego**: contás el efectivo físico, ponés solo ese número. El sistema guarda la diferencia para el encargado — el cajero no ve cuánto "debería" haber.
>
> Al cerrar se genera un **backup** automático de tu base de datos. Podés configurar carpeta en pendrive o en Google Drive desde acá.
>
> Al día siguiente, abrís turno de nuevo y listo.

---

## Video 5 — Reportes y export para contador (4 min)

**Título YouTube:** Gestión Comercios — Exportar ventas para el contador | Waltech

### Qué mostrar
1. **Reportes** → elegir período
2. **CSV contador** → guardar → abrir en Excel
3. Mostrar resúmenes arriba del archivo
4. **Resumen hoy** → WhatsApp

### Guion

> En **Reportes** ves ventas por día, productos y empleados.
>
> Para el contador: arriba a la derecha, **CSV contador**. Elegís dónde guardar y abrís con **Excel**.
>
> El archivo trae resumen por medio de pago, por día, y el detalle de cada venta. Usa punto y coma, pensado para Argentina.
>
> También tenés **Detalle CSV** si tu contador quiere línea por producto.
>
> **Resumen hoy** manda por WhatsApp las ventas del día en un mensaje listo para pegar.
>
> Eso reemplaza anotar a mano o mandar fotos del cierre.

---

## Video 6 — Mercado Pago QR (5 min)

**Título YouTube:** Gestión Comercios — Conectar Mercado Pago QR | Waltech

### Qué mostrar
1. **Administración** → Mercado Pago
2. Conectar cuenta (OAuth)
3. POS → medio Mercado Pago → QR en pantalla
4. (Simulación o pago real chico)

### Guion

> Para cobrar con **Mercado Pago QR** necesitás cuenta de vendedor MP y internet.
>
> **Administración** → sección Mercado Pago → **Conectar cuenta**. Iniciás sesión en Mercado Pago y autorizás.
>
> En el **Punto de venta**, cuando cobrás, elegí **Mercado Pago**. Se muestra el QR; el cliente escanea y paga.
>
> Cuando confirma, la venta se cierra sola en la app.
>
> Si no conectás MP, podés seguir cobrando en efectivo y tarjeta manual sin problema.

---

## Video 7 — Renovación mensual (3 min) — opcional

**Título YouTube:** Gestión Comercios — Renovar suscripción mensual | Waltech

### Guion corto

> Tu plan es **mensual**. En **Administración → Plan** ves la fecha de vencimiento.
>
> Unos días antes la app te avisa en amarillo.
>
> Para renovar, escribinos por WhatsApp con tu clave **GC-…**, transferís el mes y extendemos 30 días más. No tenés que reinstalar nada.
>
> Soporte: +54 9 266 503-1950.

---

## Checklist antes de publicar cada video

- [ ] Audio claro, sin ruido de fondo
- [ ] Mouse visible, movimientos lentos
- [ ] No se ven datos reales de clientes (usá comercio demo)
- [ ] Primer frame: app ya abierta (cortá instalador aburrido si hace falta)
- [ ] Últimos 5 seg: "Waltech — Gestión Comercios" + WhatsApp
- [ ] Link pegado en `docs/legal/ayuda.html`
- [ ] Push a GitHub para que actualice la web de ayuda

## Orden sugerido de grabación

1. Instalar y activar  
2. Primera venta (POS)  
3. Caja abrir/cerrar  
4. Importar Excel  
5. Reportes / contador  
6. Mercado Pago (si usás MP)  
7. Renovación (opcional)
