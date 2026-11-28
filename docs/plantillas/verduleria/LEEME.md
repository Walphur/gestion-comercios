# Plantilla verdulería — WalQo

Catálogo de demostración para un comercio de frutas y verduras (Argentina).

| Archivo | Para qué |
|---------|----------|
| `productos-verduleria-walqo.csv` | Lista lista para importar (códigos 100–180) |
| `imagenes/100.jpg` … | Fotos libres (Wikimedia Commons), una por código |
| `build-catalog.mjs` / `fix-missing.mjs` | Solo si regenerás el catálogo (desarrollo) |

## Qué incluye

- **81 productos** con códigos fáciles: `100`, `101`, `102`…
- Categorías: **Frutas**, **Verduras**, **Hierbas**
- Precio de venta, costo, stock y stock mínimo aproximados (ARS)
- Unidad (`kg`, `u.`, `atado`)
- Columna **imagen** con URL pública (Wikimedia); en la PC, si no hay internet, WalQo usa `imagenes/{codigo}.jpg` al lado del CSV

## Cómo importar

1. Abrí WalQo (PC o [WalQo Web](https://walqo.pro/web)).
2. Andá a **Productos → Importar → Tu Excel o CSV**.
3. Elegí `productos-verduleria-walqo.csv`.
4. Dejá marcada la opción de actualizar existentes si reimportás.

Al terminar deberías ver algo como: *81 nuevos · N con foto*.

### Fotos

- **Con internet:** se bajan desde la columna `imagen` (URL).
- **PC sin internet:** dejá la carpeta `imagenes` **junto al CSV** (misma carpeta que este LEEME). WalQo busca `imagenes/100.jpg`, etc.
- **WalQo Web:** hace falta URL `https://…` en la columna imagen (las rutas locales del disco no viajan al navegador).

## Columnas del CSV

`barcode,nombre,precio,costo,stock,sku,categoria,marca,proveedor,min_stock,unidad,imagen`

Misma lógica que la plantilla general de productos, más `unidad` e `imagen`.

## Licencia de las fotos

Las imágenes se bajaron de **Wikimedia Commons** (licencias libres). Si publicás el negocio, conviene revisar cada archivo en Commons o reemplazarlas por fotos propias del local.
