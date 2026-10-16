# Google Ads y Search Console de WalQo

Esta carpeta no se publica en walqo.pro. Tiene la campaña lista para cargar y los pasos de Search Console.

## Archivos

- `campanas.csv` — las dos campañas: Búsqueda de Google, Argentina, español, presupuesto diario y CPC manual.
- `grupos.csv` — los grupos de anuncios con su costo máximo por clic.
- `anuncios.csv` — un anuncio adaptable por grupo, con 10 títulos y 4 descripciones.
- `palabras-clave.csv` — cada búsqueda en concordancia de frase y exacta.
- `palabras-negativas.csv` — búsquedas que no traen clientes (empleo, cursos, cracks, plantillas).
- `build-campaign.mjs` — vuelve a generar los archivos y frena si un título pasa los 30 caracteres o una descripción los 90. El presupuesto y el CPC están arriba, en `DAILY_BUDGET_ARS` y `MAX_CPC_ARS`.

```
node marketing/google-ads/build-campaign.mjs
```

## Las dos campañas

**WalQo - Comercios**: kioscos, almacenes, punto de venta, stock, ferreterías, verdulerías, ropa, farmacias, gastronomía y otros rubros. Cada grupo lleva a su página del sitio.

**WalQo - Pro servicios**: supermercados, talleres, peluquerías y consultorios. Esos rubros vienen con Pro ($60.000 por mes), así que conviene medirlos aparte.

Cada enlace lleva `utm_source=google&utm_medium=cpc`, para distinguir esas visitas de las que llegan por búsqueda normal.

## Cómo cargarla

1. Bajá [Google Ads Editor](https://ads.google.com/intl/es-419/home/tools/ads-editor/), iniciá sesión y descargá la cuenta 960-737-0111.
2. Con **Cuenta → Importar → Desde archivo**, importá en este orden: `campanas.csv`, `grupos.csv`, `palabras-clave.csv`, `anuncios.csv`, `palabras-negativas.csv`. Después de cada uno tocá **Procesar** y **Finalizar y revisar**.
3. Revisá la campaña: Red de Búsqueda sin socios ni Display, Argentina, español.
4. Tocá **Publicar**.

## Presupuesto

Planificador de palabras clave, octubre de 2026, Argentina:

| Búsqueda | Búsquedas por mes | CPC parte superior (bajo – alto) |
|---|---|---|
| sistema para kioscos | 100 a 1.000 | ARS 848 – 2.569 |
| sistema punto de venta | 100 a 1.000 | ARS 1.123 – 4.969 |
| programa para kioscos | 10 a 100 | ARS 782 – 2.021 |
| programa para farmacias | 10 a 100 | ARS 656 – 4.208 |
| sistema para ferreterías | 10 a 100 | ARS 993 – 5.168 |
| programa para comercios | 10 a 100 | ARS 1.158 – 3.385 |
| programa de stock | 10 a 100 | ARS 1.512 – 3.685 |
| sistema para almacenes | 10 a 100 | ARS 2.851 – 8.256 |
| sistema para tiendas de ropa / verdulerías | sin datos | — |

Arranque: **ARS 1.000 por día** solo en *WalQo - Comercios*, con CPC máximo de ARS 1.000. *Pro servicios* queda pausada. En un mes son unos ARS 30.000 y, con esos costos, alrededor de un clic por día. Con ese CPC casi no va a salir en almacenes; kioscos, farmacias y ferreterías sí entran en el rango bajo.

Después de un mes mirá en **Campañas → Palabras clave** cuáles trajeron descargas o WhatsApp, y subí el presupuesto solo en esas.

## Medir resultados

La etiqueta de Google de la cuenta 960-737-0111 (`AW-773768520`) se carga desde `docs/assets/site.js` en todas las páginas comerciales. No se carga en turnos, carta ni taller.

Las dos conversiones están conectadas en `ADS_CONVERSIONS` de `site.js`:

- **Descarga del instalador** (categoría Registro): clic en un botón de descarga que apunta al instalador.
- **Contacto por WhatsApp** (categoría Contacto): clic en cualquier enlace a `wa.me`, incluido el botón de descarga cuando no encuentra el instalador y manda a WhatsApp.

Las dos usan valor fijo de 1 ARS y cuentan una por clic en el anuncio.

## Search Console

Search Console muestra qué búsquedas te traen visitas, en qué posición aparecés y qué páginas tiene Google.

1. Entrá a [search.google.com/search-console](https://search.google.com/search-console) con tu cuenta de Google.
2. Elegí **Prefijo de URL** y escribí `https://walqo.pro/`.
3. En los métodos de verificación elegí **Etiqueta HTML**. Te da una línea como `<meta name="google-site-verification" content="...">`.
4. Pasame esa línea. La agrego a la portada y la publico.
5. Cuando quede verificado, en **Sitemaps** escribí `sitemap.xml` y enviá.
6. En **Inspección de URLs** pegá cada página de rubro y tocá **Solicitar indexación**, para que Google las lea antes.

## Perfil de empresa en Google

En [google.com/business](https://www.google.com/business) creá el perfil de WalQo como empresa de software en San Luis, con el enlace a walqo.pro y el WhatsApp. Sirve para las búsquedas locales y para juntar reseñas de clientes.
