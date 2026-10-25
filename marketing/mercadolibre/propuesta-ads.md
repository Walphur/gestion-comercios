# Propuesta de publicidad en Mercado Libre (Product Ads) — sin activar

Fecha: 25/10/2026. Nada de esto está prendido: las publicaciones nuevas de WalQo no gastaron plata en publicidad.

## De dónde salen los números

- Las 12 publicaciones salieron hoy: 9 visitas en total, 0 preguntas, 0 ventas (`node scripts/mercadolibre/stats.mjs`).
  La que más visitas tuvo es peluquería (2); kiosco, verdulería, pet shop y ropa todavía no tuvieron ninguna.
- Con el permiso «Publicidad de un producto» ya se lee la cuenta de publicidad (anunciante 2909356). No hay una
  sugerencia de presupuesto por API; el costo por clic sale de la campaña que ya existía.

## Lo que ya hay en la cuenta (leído el 25/10, sin tocar)

- **«Campaña Mercado Libre» está activa desde junio**: estrategia rentabilidad, ACOS objetivo 20%, tope diario $4.000.
  Últimos 90 días: 15.782 veces mostrada, 22 clics, **$1.239 gastados**, 0 ventas. Costo por clic: **unos $56**.
- Dentro de esa campaña solo están activas dos publicaciones viejas: «Software Pos Kiosco Stock Caja Win 10 Suscrip»
  (MLA1835293869, la que hizo todo el gasto) y «Bacha De Apoyo De Cemento» (MLA3271623864, sin clics).
- Las 12 publicaciones nuevas de WalQo figuran en publicidad como «idle» o «hold»: **no se están publicitando**.
- Decisión para Juan (no se tocó nada): pausar esa campaña vieja o pasarle las publicaciones nuevas cuando arranque la prueba.

## Qué promocionar

Esperar 7 días sin publicidad para ver qué rubros traen visitas solos. Después, una prueba de 14 días con 3 publicaciones:

| Publicación | Por qué |
| --- | --- |
| Kiosco / almacén (WalQo Completo) | El rubro con más comercios y búsquedas; hoy sin visitas: la publicidad dice si el problema es la exposición. |
| Peluquería / barbería / estética (WalQo Completo) | La que más visitas tuvo sola; turnos online y comisiones la diferencian. |
| Licencia permanente (pago único) | La más barata: sirve para medir si el precio frena la compra. |

Si a los 7 días otro rubro (por ejemplo gastronomía o celulares) junta más visitas y preguntas que alguno de estos, se cambia por ese.

## Presupuesto

- $3.000 por día en total (unos $1.000 por publicación), 14 días: tope de $42.000.
  A $56 por clic son hasta unos 53 clics por día; la campaña vieja gastó mucho menos que su tope, así que
  probablemente se gaste bastante menos que $42.000.
- Referencia: cada venta de WalQo Completo deja unos $35.000 netos el primer mes, y la renovación mensual ($35.000)
  ya no paga comisión porque se hace desde WalQo. Con una sola venta que renueve, la prueba se paga.
- Revisar en la pantalla de Mercado Libre el mínimo diario antes de activar; si es mayor, bajar a 2 publicaciones.

## Cómo medir

- Todos los días: `node scripts/mercadolibre/stats.mjs --save` (visitas, preguntas y ventas por rubro; queda un archivo por día en `marketing/mercadolibre/stats/`).
- En Mercado Libre Ads: clics, costo por clic, ventas por publicidad y ACOS (gasto ÷ lo vendido con publicidad).
- Preguntas que entran: el worker deja registradas todas (respondidas solas o para Juan).

## Cuándo cortar o subir

- Cortar una publicación: 150 clics o 7 días sin ninguna pregunta ni venta.
- Cortar todo: se gastaron $42.000 sin ventas. Antes de volver a invertir, revisar fotos, título y precio.
- Bajar el presupuesto: ACOS arriba de 80% a los 14 días.
- Subir 50%: ACOS debajo de 35% con al menos 2 ventas.
