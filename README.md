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

## Generar instalador (.exe / MSI)

```bash
npm run build:win
```

El instalador queda en `src-tauri/target/release/bundle/`.

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

- Punto de venta, ventas, productos, stock, caja, reportes
- Cola fiscal (simulada; ARCA/AFIP en etapa posterior)
- Backup al cerrar caja

## Repo

https://github.com/Walphur/gestion-comercios
