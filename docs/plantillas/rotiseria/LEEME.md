# Plantilla rotisería — WalQo

Archivos en esta carpeta:

| Archivo | Para qué |
|---------|----------|
| `plantilla-rotiseria-walqo.xlsx` | Excel listo (hojas Productos + Combos_guia + LEEME) |
| `productos-rotiseria.csv` | Misma lista, por si preferís CSV |
| `combos-armar-en-la-app.csv` | Mapa de componentes (no se importa solo) |

## Importar el Excel

En la PC: **Productos → Importar → Tu Excel** → elegí `plantilla-rotiseria-walqo.xlsx`.

El Excel **no** crea combos ni fotos. Solo productos.

Después: editá cada plato → **Combo** → componentes según la hoja `Combos_guia`.

## Mandar todo cargado (con fotos) sin ir al local

1. En **tu** PC instalá WalQo, rubro **Gastronomía**.
2. Importá el Excel, armá combos y cargá las fotos.
3. Cerrá WalQo.
4. Copiá la carpeta:

```
%AppData%\com.gestioncomercios.app\
```

Ahí están `gestion.db` (productos, combos, precios, stock) y `product_images\` (fotos).

5. Subí un **ZIP** a Drive / pendrive.
6. En la PC del cliente: instalá WalQo → cerrala → reemplazá el contenido de:

```
C:\Users\<USUARIO>\AppData\Roaming\com.gestioncomercios.app\
```

por lo del ZIP → abrí WalQo.

Así le llega el negocio armado: productos, combos, stock y fotos.
