# Sistema de licencias — Gestión Comercios



Venta por **Mercado Libre** (u otro canal): entregás el instalador `.exe` + una **clave de licencia**. Cada clave se vincula a la PC del comprador; no puede reutilizarse en otra máquina sin contactar a Waltech.



## Planes (suscripción mensual)



| Plan   | PCs              | Precio mensual | Incluye                                      |

|--------|------------------|----------------|----------------------------------------------|

| Básico | 1                | $25.000        | POS, stock, clientes, caja, rubros estándar, actualizaciones, soporte |

| Pro    | 2 o más (config) | $35.000        | Todo lo básico + módulos Pro y rubros Pro   |



Las licencias mensuales **vencen a los 30 días**. La app muestra la fecha de vencimiento y avisa cuando faltan ≤7 días. Para renovar: `renovar-licencia.bat` o `license-admin.mjs extend`.



Clientes con **pago único** (early adopters) conservan licencia permanente sin vencimiento.



## Flujo de venta



1. El cliente compra en Mercado Libre (o paga por transferencia).

2. Vos generás una clave mensual con el script de admin (abajo).

3. Enviás por mensaje de ML:

   - Link al instalador (release de GitHub).

   - Clave: `GC-XXXX-XXXX-XXXX`.

   - Aclaración: válida 30 días, renovación mensual.

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

npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v2.sql

npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v3.sql

npx wrangler secret put LICENSE_PRIVATE_KEY_B64

npx wrangler secret put LICENSE_ADMIN_SECRET

npm run deploy

```



URL por defecto: `https://gestion-comercios-license.walphur.workers.dev`



## Generar claves al vender (fácil — doble clic)



### Panel web (recomendado)



https://walphur.github.io/gestion-comercios/tools/licencias-admin.html



- Dashboard: activas, vencidas, MRR estimado
- Crear licencia con nombre y teléfono del cliente
- **Marcar «Pagó»** → suma 30 días y registra la fecha de pago
- Bloquear / desbloquear
- Buscar por clave, cliente o pedido ML
- Copiar mensaje para el comprador



Mismo secreto que `workers/license-api/.admin-secret.txt` (solo vos).



### Archivos .bat (alternativa)



En la carpeta del proyecto:



| Archivo | Qué hace |

|---------|----------|

| `crear-licencia-mensual.bat` | **Principal** — Básico mensual (30 días) |

| `renovar-licencia.bat` | Suma 30 días a una clave existente |

| `marcar-pago-licencia.bat` | Registra pago + renueva 30 días |

| `crear-licencia.bat` | Menú completo (básico, pro, listar, revocar) |

| `crear-licencia-basica.bat` | Básico pago único (legacy / early adopters) |

| `crear-licencia-pro.bat` | Pro (elegís cuántas PCs) |



Doble clic → pedís número de pedido ML → te imprime la clave y un **mensaje listo para copiar** al comprador.



El secreto admin se lee solo de `workers/license-api/.admin-secret.txt` (no hace falta pegarlo cada vez).



## Generar claves por terminal (alternativa)



```bash

set LICENSE_API_URL=https://gestion-comercios-license.walphur.workers.dev

set LICENSE_ADMIN_SECRET=tu_secreto



# Básico mensual — 1 PC, 30 días

node scripts/license-admin.mjs create --plan basic --monthly --months 1 --note "ML pedido 12345"



# Pro mensual — 3 PCs

node scripts/license-admin.mjs create --plan pro --monthly --months 1 --devices 3 --note "ML pedido 67890"



# Renovar cuando pagan el mes

node scripts/license-admin.mjs extend --key GC-XXXX-XXXX-XXXX --months 1



# Marcar pago (renueva + registra fecha)

node scripts/license-admin.mjs pay --key GC-XXXX-XXXX-XXXX --months 1



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



## Pasar de Básico a Pro (misma PC)



El cliente **no** tiene que reinstalar. En la app:



1. **Administración** → **Planes y módulos**

2. Botón **«Actualizar a Pro / cambiar licencia»**

3. Ingresar la **nueva clave Pro** comprada

4. La app reemplaza la licencia en esa PC y habilita rubros y módulos Pro



Vos generás la clave Pro con `crear-licencia-pro.bat` (o `--monthly`) y se la mandás al cliente.



## Transferencia de PC



Si el cliente cambia de computadora: revocá la licencia y generá una nueva, o agregá un endpoint de “desactivar PC” (soporte manual por ahora).



## Apps custom por local



Sobre la misma base: mismo sistema de licencias con `buyer_note` o planes especiales (`max_devices`, módulos). Podés crear claves Pro con más PCs o builds con branding distinto manteniendo el mismo API.

