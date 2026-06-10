# Sistema de licencias — Gestión Comercios

Venta por **Mercado Libre** (u otro canal): entregás el instalador `.exe` + una **clave de licencia**. Cada clave se vincula a la PC del comprador; no puede reutilizarse en otra máquina sin contactar a Waltech.

## Planes (pago único)

| Plan   | PCs              | Incluye                                      |
|--------|------------------|----------------------------------------------|
| Básico | 1                | POS, stock, clientes, caja, rubros estándar |
| Pro    | 2 o más (config) | Todo lo básico + módulos Pro y rubros Pro   |

## Flujo de venta

1. El cliente compra en Mercado Libre.
2. Vos generás una clave con el script de admin (abajo).
3. Enviás por mensaje de ML:
   - Link al instalador (release de GitHub).
   - Clave: `GC-XXXX-XXXX-XXXX`.
4. El cliente instala, abre la app e ingresa la clave **en esa PC**.
5. La app consulta el servidor, registra el ID de hardware y guarda la licencia firmada.

Si intenta copiar el `.exe` a otra PC, la clave ya está ligada a la primera (plan Básico) o agotó el cupo de PCs (plan Pro).

## Despliegue del servidor (una vez)

```bash
cd workers/license-api
npm install
npx wrangler d1 create gestion-licenses
# Copiar database_id en wrangler.toml

npx wrangler d1 execute gestion-licenses --file=./schema.sql
npx wrangler secret put LICENSE_PRIVATE_KEY_B64
# Pegar: MC4CAQAwBQYDK2VwBCIEIPDpWCn1XF5JafvmpLVnx/iCLO4+Ns41OET10uxYp6Lo
# (o regenerar con node scripts/gen-license-keys.mjs y actualizar clave pública en Rust + wrangler.toml)

npx wrangler secret put LICENSE_ADMIN_SECRET
# Elegir una contraseña larga solo para vos

npm run deploy
```

URL por defecto: `https://gestion-comercios-license.walphur.workers.dev`

## Generar claves al vender

```bash
set LICENSE_API_URL=https://gestion-comercios-license.walphur.workers.dev
set LICENSE_ADMIN_SECRET=tu_secreto

# Básico — 1 PC
node scripts/license-admin.mjs create --plan basic --note "ML pedido 12345"

# Pro — 3 PCs
node scripts/license-admin.mjs create --plan pro --devices 3 --note "ML pedido 67890"

# Listar / revocar
node scripts/license-admin.mjs list
node scripts/license-admin.mjs revoke --key GC-XXXX-XXXX-XXXX
```

## Seguridad

- Licencia firmada con **Ed25519** (no se puede falsificar sin la clave privada del servidor).
- ID de PC = hash del **MachineGuid** de Windows.
- Revalidación online cada ~14 días; gracia offline de 14 días sin internet.
- El `.exe` siempre se puede copiar; lo que no se puede es **activar sin clave válida** ni **reusar la misma clave** en más PCs de las permitidas.

## Desarrollo local

Sin bloqueo de licencia en debug:

```bash
set GESTION_LICENSE_DEV=1
cargo tauri dev
```

**No** usar `GESTION_LICENSE_DEV` en builds de release para clientes.

## Rotar claves de firma (producción)

```bash
node scripts/gen-license-keys.mjs
```

Actualizar:

1. `LICENSE_PUBLIC_KEY_HEX` en `src-tauri/src/license.rs`
2. `LICENSE_PUBLIC_KEY_HEX` en `workers/license-api/wrangler.toml`
3. Secret `LICENSE_PRIVATE_KEY_B64` en Cloudflare

## Transferencia de PC

Si el cliente cambia de computadora: revocá la licencia y generá una nueva, o agregá un endpoint de “desactivar PC” (soporte manual por ahora).

## Apps custom por local

Sobre la misma base: mismo sistema de licencias con `buyer_note` o planes especiales (`max_devices`, módulos). Podés crear claves Pro con más PCs o builds con branding distinto manteniendo el mismo API.
