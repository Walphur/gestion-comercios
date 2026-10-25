# Propuesta de publicidad en Mercado Libre (Product Ads) — sin activar

Fecha: 25/10/2026. Nada de esto está prendido ni gastó plata.

## De dónde salen los números

- Las 12 publicaciones salieron hoy: 9 visitas en total, 0 preguntas, 0 ventas (`node scripts/mercadolibre/stats.mjs`).
  La que más visitas tuvo es peluquería (2); kiosco, verdulería, pet shop y ropa todavía no tuvieron ninguna.
- La API de publicidad responde 403: la app «WalQo Publicaciones» no tiene el permiso «Publicidad de un producto».
  Por eso no hay sugerencias ni costos por clic de Mercado Libre en esta propuesta. Para leerlos hace falta sumar
  ese permiso en el DevCenter y volver a autorizar la cuenta (`node scripts/mercadolibre/connect.mjs --url`).

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
