# Reel WalQo

Pieza vertical de 17,2 segundos para publicar como Reel.

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
