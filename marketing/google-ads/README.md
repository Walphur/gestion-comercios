# Google Ads y Search Console de WalQo

Esta carpeta no se publica en walqo.pro. Tiene la campaña lista para cargar y los pasos de Search Console.

## Archivos

- `anuncios.csv` — un anuncio adaptable por grupo, con 10 títulos y 4 descripciones.
- `palabras-clave.csv` — cada búsqueda en concordancia de frase y exacta.
- `palabras-negativas.csv` — búsquedas que no traen clientes (empleo, cursos, cracks, plantillas).
- `build-campaign.mjs` — vuelve a generar los tres archivos y frena si un título pasa los 30 caracteres o una descripción los 90.

```
node marketing/google-ads/build-campaign.mjs
```

## Las dos campañas

**WalQo - Comercios**: kioscos, almacenes, punto de venta, stock, ferreterías, verdulerías, ropa, farmacias, gastronomía y otros rubros. Cada grupo lleva a su página del sitio.

**WalQo - Pro servicios**: supermercados, talleres, peluquerías y consultorios. Esos rubros vienen con Pro ($60.000 por mes), así que conviene medirlos aparte.

Cada enlace lleva `utm_source=google&utm_medium=cpc`, para distinguir esas visitas de las que llegan por búsqueda normal.

## Cómo cargarla

1. Entrá a [ads.google.com](https://ads.google.com) y creá la cuenta en modo experto, no en el modo inteligente.
2. Bajá [Google Ads Editor](https://ads.google.com/intl/es-419/home/tools/ads-editor/) e iniciá sesión con esa cuenta.
3. Creá las dos campañas con estos datos:
   - Tipo: Búsqueda. Desactivá la Red de Display y los socios de búsqueda.
   - Ubicación: Argentina. Para empezar podés limitarla a tu provincia.
   - Idioma: español.
   - Puja: maximizar clics con un límite de costo por clic, hasta tener conversiones medidas.
4. En Editor usá **Cuenta → Importar → Desde archivo** con `palabras-clave.csv`, después `anuncios.csv` y por último `palabras-negativas.csv`.
5. Revisá los cambios y tocá **Publicar**.

## Presupuesto

No hay un número fijo: depende de cuánto cobra Google por clic en cada búsqueda. Antes de activar, abrí **Herramientas → Planificador de palabras clave** y mirá el costo por clic estimado de las búsquedas de `palabras-clave.csv`.

Empezá con un tope diario que puedas sostener un mes entero. Recién después de esas semanas sabés cuánto te cuesta cada persona que descarga o escribe.

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
