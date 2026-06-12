# Cómo hacer las imágenes para ML, Marketplace y el grupo

Hay **dos tipos** de imágenes: capturas reales de la app y una portada promocional.

---

## Tipo 1 — Capturas de la app (lo más importante)

Mercado Libre y Facebook confían más cuando ven el **programa de verdad**.

### Paso 1: Preparar la app con datos lindos

1. Abrí Gestión Comercios (instalado o `npm run tauri dev`).
2. Si es instalación nueva, en el asistente elegí **“Catálogo de demostración”** — carga Coca-Cola, alfajores, yerba, etc.
3. Rubro: **Kiosco** o **Almacén**.
4. Entrá con usuario admin.

### Paso 2: Pantallas a capturar (en este orden)

| # | Menú | Qué mostrar |
|---|------|-------------|
| 1 | **POS** | Carrito con 2–3 productos y total visible |
| 2 | **Productos** | Lista con nombres y precios |
| 3 | **Stock** | Cantidades y algún producto en mínimo |
| 4 | **Caja** | Turno abierto con movimientos |
| 5 | **Reportes** | Gráfico o tabla de ventas |
| 6 | **Activación** | Pantalla de licencia (podés abrir en otra PC o simular desactivando licencia en admin) |

### Paso 3: Sacar la captura en Windows

**Opción A (rápida):** `Win + Shift + S` → **Recorte rectangular** → seleccioná solo la ventana de la app.

**Opción B (ventana completa):** `Alt + Print Screen` (solo la ventana activa) → pegá en Paint → guardá como PNG.

**Opción C (herramienta):** “Recortes” de Windows → modo ventana.

### Paso 4: Ajustar tamaño

- Mercado Libre recomienda **mínimo 500×500**, ideal **1200×1200** o más.
- Si la captura es chica, agrandá en [Photopea](https://www.photopea.com) (gratis, en el navegador) sin deformar.
- Guardá en **PNG** (mejor calidad que JPG para texto).

### Consejos para que se vea prolijo

- Ventana de la app **maximizada** o bien grande (no minimizada).
- **Ocultá** datos personales si aparecen (nombre del negocio real → poné “Kiosco Demo”).
- Misma **tema claro u oscuro** en todas las fotos.
- No captures el escritorio desordenado — solo la app.

---

## Tipo 2 — Portada promocional (primera foto de ML)

### Opción fácil: plantilla incluida

1. Abrí en el navegador:
   ```
   docs/marketing/portada-mercadolibre.html
   ```
   (doble clic en el archivo)

2. `F11` para pantalla completa si hace falta.

3. `Win + Shift + S` y recortá **solo el cuadrado** de la tarjeta (fondo oscuro con “Gestión Comercios”).

4. Guardá como `01-portada-ml.png`.

### Opción Canva (más personalizada)

1. Entrá a [canva.com](https://www.canva.com) → plantilla **“Publicación Instagram”** (1080×1080) o **1200×1200**.
2. Fondo oscuro o azul (colores Waltech).
3. Texto:
   - Título: **Gestión Comercios**
   - Subtítulo: **POS · Stock · Caja**
   - Badge: **Pago único · Sin mensualidad**
   - Pie: **Windows 10/11 · Waltech**
4. Subí el logo: `src-tauri/icons/icon.png`
5. Descargá PNG.

---

## Orden sugerido al subir en Mercado Libre

1. **Portada** (HTML o Canva) — primera imagen, la que ven en el listado
2. **POS** con productos
3. **Productos**
4. **Caja**
5. **Reportes**
6. **Stock**
7. (Opcional) Activación de licencia

Máximo **12 fotos** en ML; con **5–6** alcanza.

---

## Facebook Marketplace y grupo de kiosqueros

- **Marketplace:** 3 fotos — portada + POS + productos.
- **Grupo:** la misma portada + 1 captura del POS; el texto del post hace el resto.

---

## Tamaños de referencia

| Canal | Tamaño recomendado |
|-------|-------------------|
| Mercado Libre (principal) | 1200 × 1200 px |
| Mercado Libre (galería) | hasta 1920 px de ancho |
| Facebook Marketplace | 1080 × 1080 o más |
| Grupo WhatsApp | cualquier PNG, no más de 2–3 MB |

---

## Checklist rápido

- [ ] Catálogo demo cargado
- [ ] 5 capturas PNG de la app
- [ ] 1 portada (HTML o Canva)
- [ ] Logo Waltech en portada (`src-tauri/icons/icon.png`)
- [ ] Revisar que no se vean datos privados
