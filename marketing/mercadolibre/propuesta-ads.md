# Publicidad en Mercado Libre (Product Ads) — prueba de 14 días en marcha

Fecha: 25/10/2026. La prueba arrancó hoy con la bonificación de Mercado Libre; ver «Lo que se cambió hoy».

## De dónde salen los números

- Las 12 publicaciones salieron hoy: 9 visitas en total, 0 preguntas, 0 ventas (`node scripts/mercadolibre/stats.mjs`).
  La que más visitas tuvo es peluquería (2); kiosco, verdulería, pet shop y ropa todavía no tuvieron ninguna.
- Con el permiso «Publicidad de un producto» ya se lee la cuenta de publicidad (anunciante 2909356). No hay una
  sugerencia de presupuesto por API; el costo por clic sale de la campaña que ya existía.
- La API solo deja leer: los cambios de campaña se hacen desde la web de Mercado Ads.

## Cómo estaba la cuenta antes (leído el 25/10)

- **«Campaña Mercado Libre» activa desde junio**: estrategia rentabilidad, ACOS objetivo 20% (en la web: ROAS 5x),
  tope diario $2.000. Últimos 90 días: 15.782 veces mostrada, 22 clics, **$1.239 gastados**, 0 ventas.
  Costo por clic: **unos $56**.
- Solo publicitaba dos publicaciones viejas: «Software Pos Kiosco Stock Caja Win 10 Suscrip» (MLA1835293869, la que
  hizo todo el gasto) y «Bacha De Apoyo De Cemento» (MLA3271623864, sin clics).
- Las 12 publicaciones nuevas de WalQo no se estaban publicitando.

## Lo que se cambió hoy (25/10, con OK de Juan)

1. Se pausó la campaña.
2. Se pausaron dentro de la campaña las dos publicaciones viejas. Las publicaciones siguen activas en Mercado Libre;
   solo dejan de tener publicidad.
3. Se sumaron a la campaña las 3 de WalQo:
   - Kiosco / almacén — MLA2233219581 ($41.500)
   - Peluquería / barbería / estética — MLA4123652356 ($41.500)
   - Licencia permanente — MLA4123652366 ($17.500)
4. Presupuesto diario: de $2.000 a **$3.000**. «Ajuste automático de presupuesto» y «fechas especiales» quedaron
   apagados, así que no sube solo. Mercado Libre avisa que con este monto el mes no pasa de $90.000.
5. Se mantuvo el objetivo de rentabilidad: ROAS 5x (ACOS 20%).
6. Se reactivó la campaña. Estado en la web: «Activa — Aprendiendo».

Verificado por API después del cambio: campaña activa, $3.000 diarios, las 3 de WalQo activas y las 2 viejas pausadas.

## Bonificación

- Disponible: **$42.953,88**, vence el 13/06/2027. Ya se usaron $2.046,12 en los últimos 60 días.
- Mercado Libre la descuenta primero de lo que se gasta en publicidad. **Los cargos en la factura mensual empiezan
  recién cuando se agota.**
- 14 días × $3.000 = $42.000 como máximo, menos que la bonificación. La prueba no debería costar plata real.
- **Ojo:** si se deja la campaña prendida más de 14 días, o si Mercado Libre gasta un poco más algún día (el tope es
  un promedio), la bonificación se termina y empieza a facturar. **Pausar la campaña el 08/11/2026** o antes si el
  disponible baja de $3.000.

## Por qué estas 3

| Publicación | Por qué |
| --- | --- |
| Kiosco / almacén (WalQo Completo) | El rubro con más comercios y búsquedas; hoy sin visitas: la publicidad dice si el problema es la exposición. |
| Peluquería / barbería / estética (WalQo Completo) | La que más visitas tuvo sola; turnos online y comisiones la diferencian. |
| Licencia permanente (pago único) | La más barata: sirve para medir si el precio frena la compra. |

- Referencia: cada venta de WalQo Completo deja unos $35.000 netos el primer mes, y la renovación mensual ($35.000)
  ya no paga comisión porque se hace desde WalQo. Con una sola venta que renueve, la prueba se paga.
- A $56 por clic, $3.000 son hasta unos 53 clics por día. La campaña vieja gastaba mucho menos que su tope.

## Cómo medir (25/10 al 08/11)

- Todos los días: `node scripts/mercadolibre/stats.mjs --save` (visitas, preguntas y ventas por publicación; queda un
  archivo por día en `marketing/mercadolibre/stats/`).
- Publicidad: `node workers/license-api/.wrangler/ml-ads-probe.mjs` o la web de Mercado Ads: impresiones, clics,
  costo por clic, ventas por publicidad y ACOS (gasto ÷ lo vendido con publicidad).
- Bonificación: «Bonificación disponible» arriba a la derecha en Mercado Ads → «Más detalles».
- Preguntas que entran: el worker deja registradas todas (respondidas solas o para Juan).
- Comparar contra las otras 9 publicaciones de WalQo, que siguen sin publicidad.

## Cuándo cortar o subir

- Pausar una publicación: 150 clics o 7 días sin ninguna pregunta ni venta.
- Pausar todo: el 08/11/2026, o antes si la bonificación baja de $3.000, o si se gastan $42.000 sin ventas.
  Antes de volver a invertir, revisar fotos, título y precio.
- Si a los 7 días otro rubro (por ejemplo gastronomía o celulares) junta más visitas y preguntas sin publicidad que
  alguna de estas, se cambia por ese.
- Bajar el presupuesto: ACOS arriba de 80% a los 14 días.
- Subir 50%: ACOS debajo de 35% con al menos 2 ventas, y solo con OK de Juan porque ahí ya se paga con plata real.
