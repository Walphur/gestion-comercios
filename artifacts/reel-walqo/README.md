# Reel WalQo

La pieza vertical nueva es `walqo-reel-vertical-v2.mp4`: 22 segundos, 1080×1920, 30 fps, H.264 y audio AAC.

Las capturas van enteras, con la proporción original, sobre un fondo desenfocado de la misma pantalla. No se recortan para llenar el 9:16.

Siguen disponibles `walqo-reel-final.mp4` (30,7 segundos) y `walqo-reel.mp4` (17,2 segundos).

## Versión vertical

- `walqo-reel-vertical-v2.mp4` — video de 22 segundos.
- `walqo-voz-v2.wav` — locución.
- `walqo-subtitulos-v2.srt` — subtítulos.
- `captures/` — copias de las pantallas. El video no modifica los originales.
- `build-vertical-v2.mjs` — vuelve a exportarla con `node build-vertical-v2.mjs`.

Cada escena muestra la ventana completa, con borde, sombra y una luz azul. El fondo es la misma captura ampliada, desenfocada y oscurecida. El acercamiento del inicio es otra toma: primero se ve el panel entero y después las tarjetas de ventas, caja y stock.

No entra la pantalla de clientes: tiene nombres, teléfonos y un documento. En caja, la ruta del disco queda desenfocada. Tienda Nube, Mercado Pago y la app del celular se muestran como pantallas para conectar, no como una cuenta ya vinculada. No se usa la pantalla de ARCA porque figura sin conexión.

## Versión final

- `walqo-reel-final.mp4` — video de 30,7 segundos.
- `walqo-voz-final.wav` — locución de esa versión.
- `walqo-subtitulos-final.srt` — subtítulos.
- `build-final.mjs` — vuelve a exportarla con `node build-final.mjs`.

El cierre dice «Probá gratis», que es la oferta de la web. No dice «gratis para siempre»: el plan gratis llega hasta 25 productos y 50 ventas por mes. No aparecen pinturería ni bazar.

## Versión corta

Pieza vertical de 17,2 segundos.

## Archivos

- `walqo-reel.mp4` — video final, 1080×1920, 30 fps, H.264, audio AAC.
- `walqo-voz.wav` — locución.
- `walqo-subtitulos.srt` — subtítulos con los mismos tiempos que la voz.
- `build-reel.mjs` — vuelve a exportar todo.

## Herramientas

- Node.js y `ffmpeg-static` para armar el video.
- `node-edge-tts` con la voz `es-AR-TomasNeural` (español de Argentina).
- Capturas reales de `docs/marketing/shots/` (`pos.png`, `productos.png`, `stock.png`).
- Logo `docs/branding/walqo-mark.png`.
- Tipografía Segoe UI, que ya está en Windows.
- Música original: un fondo de tonos graves generado en el script, más bajo que la voz. No usa temas de terceros.

## Cómo volver a exportar

Desde esta carpeta:

```
npm install
node build-reel.mjs
```

Hace falta internet para la voz. El script corta la exportación si la duración queda fuera de 15 a 20 segundos.

## Qué se muestra

1. Logo y el punto de venta completo.
2. Rubros que existen en WalQo: kiosco, almacén, ferretería, indumentaria, farmacia, verdulería, panadería y librería.
3. Pantallas enteras de venta, productos y stock. El menú de caja se ve en esas capturas.
4. La misma pantalla de venta y el texto de dos computadoras sincronizadas en la red del local.
5. Cierre con walqo.pro.

Los subtítulos van al pie, en un tamaño chico, y no tapan el logo ni la interfaz.

## Límites

- La voz es sintética, no una grabación de una persona.
- Las capturas son del local de demostración que ya está en la web (Kiosco Don Juan). No se abrió la app con datos de un cliente.
- No hay un video de dos computadoras sincronizando en vivo. La conexión muestra la función real de sincronización en la red del local.
- No se mencionan pinturería ni bazar: no son rubros del producto.
