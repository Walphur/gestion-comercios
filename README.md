# Gestión Comercios

App de escritorio **offline** para kioscos y comercios (Tauri 2 + React + SQLite).

## Requisitos

- Node.js 20+
- Rust + Visual Studio Build Tools (Windows)
- WebView2

## Desarrollo

```bash
npm install
npm run tauri dev
```

En Windows podés usar `iniciar.bat` si `cargo` no está en el PATH.

## Generar instalador (.exe / MSI) con catálogo incluido

1. Copiá **`productos_supermercado.csv`** en la raíz del proyecto (~200 MB).
2. Ejecutá **`compilar-instalador.bat`**.

El instalador quedará ~250–350 MB (app + CSV). La **primera vez** que abran la app, un asistente pregunta:

- **No** — empezar vacío (verdulería, petshop, etc.)
- **Catálogo completo** — ~190.000 productos (15–25 min)
- **Solo categorías elegidas** — más rápido (ej. solo “Mascotas” o “Bebidas”)

En **Productos → Quitar catálogo masivo** pueden borrar el listado importado si se arrepintieron.

Sin el CSV, `compilar-instalador.bat` avisa y no compila (para no publicar un instalador vacío).

```bash
npm run build:win
```

El instalador queda en `src-tauri/target/release/bundle/`:

| Archivo | Uso |
|---------|-----|
| `nsis/Gestión Comercios_0.1.0_x64-setup.exe` | Instalador recomendado (doble clic) |
| `msi/Gestión Comercios_0.1.0_x64_en-US.msi` | Alternativa MSI |

En Windows podés ejecutar **`compilar-instalador.bat`** (abre la carpeta al terminar).

### Instalar en otra PC

1. Copiá el `.exe` del instalador (no hace falta Node ni Rust en esa máquina).
2. Necesita **WebView2** (Windows 10/11 suele tenerlo; si falla, instalá [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)).
3. Ejecutá el instalador → abrí **Gestión Comercios** desde el menú Inicio.
4. Login: `admin` / `1234` → **Administración** para nombre del comercio y rubro.

Los datos (SQLite) se guardan en la carpeta de datos de la app del usuario, no en la carpeta del instalador.

## Importar productos masivos

1. **Productos** → **Importar CSV**
2. Formato de ejemplo:

```csv
barcode,nombre,precio,costo,stock,sku,categoria
7790001001001,Coca 500ml,1200,800,24,,Bebidas
```

La importación corre en Rust por lotes (adecuada para catálogos grandes).

## Usuarios demo

| Usuario | PIN  | Rol        |
|---------|------|------------|
| admin   | 1234 | Admin      |
| cajero  | 0000 | Cajero     |

Admin PIN de configuración (panel Administración): `1234` por defecto.

## Módulos

- Punto de venta (atajos F1/F2, escaneo, búsqueda FTS en catálogos grandes), ventas, productos, stock, caja
- **Caja**: ingresos/egresos del turno + arqueo ciego + backup
- **Clientes** y venta a **fiado** (cuenta corriente, cobros, límite de crédito)
- **Reportes**: ventas, empleados, ganancia estimada (admin/encargado)
- Importación y **exportación CSV** de productos; ajuste masivo de precios por categoría/marca/proveedor
- **Personalización**: color de marca, logo del negocio, densidad de UI, subtítulo en menú
- **Actualizaciones automáticas** vía Tauri (GitHub Releases) — ver `docs/ACTUALIZACIONES.md`
- Cola fiscal (simulada; ARCA/AFIP en etapa posterior)

## Repo

https://github.com/Walphur/gestion-comercios
