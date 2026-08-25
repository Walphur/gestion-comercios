# Phase 0 — Runbook físico 2-PC (operativo)

**Estado global:** UNTESTED  
**Versión objetivo:** **1.0.10** (o superior con fixes P0/P1)  
**Regla:** ningún test se marca **PASS** sin confirmación tuya del resultado real.  
**Regla:** si un test **FAIL** → detenerse, documentar evidencia, **no** tocar código sin autorización.  
**Regla:** no usar datos de producción.

---

## 0. Roles fijos

| PC | Rol Sync LAN | Uso |
|----|--------------|-----|
| **PC A** | **Server / Hub** (Oficina) | Host Sync LAN, escucha TCP **48765**, UDP announce **48766** |
| **PC B** | **Client / Caja** | Se conecta al hub A |

Ambas en la **misma LAN** (Wi‑Fi o cable). Firewall Windows: permitir WalQo / puerto 48765 TCP (y UDP 48766 si el firewall lo bloquea).

---

## 1. Preparación (completar antes del Test A)

### 1.1 Hoja de entorno (rellenar a mano)

| Campo | PC A (Server) | PC B (Client) |
|-------|---------------|---------------|
| Hostname Windows | | |
| Versión WalQo (Acerca de / instalador) | | → debe ser **1.0.10+** |
| Rol Sync LAN | server | client |
| Nombre dispositivo (UI) | | |
| `lan_sync_device_id` | | |
| `lan_sync_device_code` | | (distinto de A) |
| IP LAN (IPv4) | | |
| Puerto TCP | 48765 | → apunta a IP de A |
| PSK (mismo en ambos) | `________` | `________` (igual) |
| `lan_sync_enabled` | 1 (al iniciar server) | 1 (al conectar) |
| Ruta `gestion.db` | | |
| Fecha/hora inicio | | |
| Operador | | |

**Cómo ver versión:** pantalla Acerca de / instalador NSIS / `package.json` del build = 1.0.10.

**Cómo ver IP:** PowerShell `ipconfig` → IPv4 de la interfaz LAN (no VirtualBox/WSL).

### 1.2 Ruta de la base (prueba, no producción)

Ruta típica Tauri (Windows):

```text
%APPDATA%\com.gestioncomercios.app\gestion.db
```

Equivalente expandido:

```text
C:\Users\<USUARIO>\AppData\Roaming\com.gestioncomercios.app\gestion.db
```

Confirmar: con la app **cerrada**, esa carpeta existe y hay `gestion.db` (+ posibles `-wal`/`-shm`).

### 1.3 Base limpia de prueba (obligatorio)

**No** usar la DB de un comercio real.

Opciones (elegir una y anotar cuál):

1. **Perfil QA limpio (recomendado)**  
   - Cerrar WalQo.  
   - Renombrar carpeta AppData:  
     `com.gestioncomercios.app` → `com.gestioncomercios.app.prod-backup`  
   - Abrir WalQo (crea DB nueva).  
   - Activar licencia de **prueba** / trial si hace falta.  
   - Cargar **pocos productos de prueba** (mín. 3 productos **sin variantes**).  
   - Crear **1 cliente** de prueba para fiado.

2. **Copia aislada en otra máquina/usuario Windows** dedicado a QA.

Tras la corrida, restaurar backup de producción si se renombró la carpeta.

### 1.4 Herramienta SQL

Instalar/usar **DB Browser for SQLite** o `sqlite3.exe`.

**Importante:** con WalQo **abierta**, preferir consultas en modo lectura o cerrar la app unos segundos antes de abrir la DB (evitar corrupción WAL). Ideal: cerrar app → copiar `gestion.db` (+ wal si existe) a carpeta `qa-evidence\` → abrir la **copia**.

Plantilla de evidencia por PC:

```text
qa-evidence\YYYY-MM-DD\
  A\gestion.db.copy
  B\gestion.db.copy
  capturas\
  notas.md
```

### 1.5 Consultas SQL canónicas (copiar/pegar)

**Identidad / sync settings**

```sql
SELECT key, value FROM settings
WHERE key IN (
  'lan_sync_role',
  'lan_sync_enabled',
  'lan_sync_device_id',
  'lan_sync_device_name',
  'lan_sync_device_code',
  'lan_sync_psk',
  'lan_sync_port',
  'lan_sync_server_host',
  'lan_sync_lamport',
  'lan_sync_catchup_lamport',
  'lan_sync_catchup_event_id',
  'lan_sync_last_ok_at'
)
ORDER BY key;
```

**Outbox**

```sql
SELECT status, COUNT(*) AS n
FROM lan_sync_outbox
GROUP BY status;

SELECT id, event_id, entity_type, op, status, attempt_count, last_error, sending_at
FROM lan_sync_outbox
WHERE status IN ('pending','sending','failed')
ORDER BY id DESC
LIMIT 50;
```

Pendientes “reales” para gate:

```sql
SELECT COUNT(*) AS pending_like
FROM lan_sync_outbox
WHERE status IN ('pending','sending','failed')
  AND COALESCE(last_error,'') != 'dead_letter_max_attempts';
```

Objetivo al final de sync estable: **0**.

**Applied**

```sql
SELECT COUNT(*) AS applied_total FROM lan_sync_applied;

SELECT event_id, entity_type, applied_at
FROM lan_sync_applied
ORDER BY applied_at DESC
LIMIT 30;
```

**Event store (hub A)**

```sql
SELECT COUNT(*) AS store_total FROM lan_sync_event_store;

SELECT event_id, entity_type, entity_sync_id, op, lamport, origin_device
FROM lan_sync_event_store
ORDER BY lamport DESC, event_id DESC
LIMIT 30;
```

**Venta + ítems (por doc o sync_id)**

```sql
-- Reemplazar DOC o SYNC
SELECT id, sync_id, doc_number, total, voided, payment_method, created_at
FROM sales
WHERE doc_number = 'DOC' OR sync_id = 'SYNC';

SELECT si.id, si.sync_id, si.name, si.qty, si.line_total
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.sync_id = 'SYNC'
ORDER BY si.id;

SELECT COUNT(*) AS n_items
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.sync_id = 'SYNC';
```

**Stock producto (usar productos SIN variante)**

```sql
SELECT id, name, stock, sync_id FROM products WHERE name LIKE '%QA%' ORDER BY id;

SELECT m.sync_id, m.qty, m.movement_type, m.created_at, m.device_id, p.name
FROM stock_movements m
JOIN products p ON p.id = m.product_id
WHERE p.sync_id = 'PRODUCT_SYNC'
ORDER BY m.id;
```

**Fiado / balance**

```sql
SELECT id, name, balance, sync_id FROM customers WHERE name LIKE '%QA%';

SELECT sync_id, delta, reason, device_id, created_at
FROM customer_balance_movements
WHERE customer_id = (
  SELECT id FROM customers WHERE sync_id = 'CUST_SYNC'
)
ORDER BY id;
```

### 1.6 UI Sync LAN

Administración → panel **Sync LAN** (o equivalente):

- Guardar PSK **idéntico** en A y B.  
- A: modo **Servidor** → Iniciar. Estado → Connected / escuchando.  
- B: modo **Cliente**, host = IP de A (o Discover) → Conectar.  
- Observar: **Pendientes**, conflictos, logs, `device_code`.

### 1.7 Datos semilla mínimos (ambos PCs tras pair, o solo A y sync)

Crear **solo en A** (luego sync a B) o crear en ambos con cuidado:

| Dato | Nota |
|------|------|
| Productos `QA-Agua`, `QA-Galletas`, `QA-Aceite` | **Sin variantes**; stock inicial conocido (ej. 100) |
| Cliente `QA-Cliente-Fiado` | Límite de crédito alto |
| Caja abierta en A y B | Necesaria para vender |

Anotar stock inicial de `QA-Agua` en A y B **después** del primer sync de productos:

| Producto | stock A | stock B | sync_id |
|----------|---------|---------|---------|
| QA-Agua | | | |

---

## 2. Matriz de resultados (llenar durante la corrida)

Leyenda: `UNTESTED` | `PASS` | `FAIL` | `BLOCKED`

| ID | Test | Resultado | Evidencia (ruta/nota) |
|----|------|-----------|------------------------|
| A | Pairing / PSK / WS Connected | **UNTESTED** | |
| B | Venta A → B | **UNTESTED** | |
| C | Venta B → A | **UNTESTED** | |
| D | Stock concurrente −2 / +10 | **UNTESTED** | |
| E | Fiado +10000 / +5000 → 15000 | **UNTESTED** | |
| F | Void/update sin duplicar ítems | **UNTESTED** | |
| G | Duplicate delivery | **UNTESTED** | |
| H | Disconnect | **UNTESTED** | |
| I | Reconnect + catch-up | **UNTESTED** | |
| J | ACK lost / retry | **UNTESTED** | |
| K | Catch-up ≥500 (~1000) | **UNTESTED** | |
| L | Restart server/client | **UNTESTED** | |
| M | Close during sending | **UNTESTED** | |

**Gate Phase 0:** todos PASS → listo para declarar Phase 0 PASS (tarea separada).  
Cualquier FAIL o UNTESTED → **NOT READY FOR PHASE 1**.

Plantilla por test (copiar en `notas.md`):

```text
ID:
Acción:
PC:
Resultado esperado:
Resultado real:
Evidence:
PASS/FAIL/UNTESTED:
```

---

## TEST A — Pairing

**Resultado:** UNTESTED  

### Pasos

1. En **A**: Sync LAN → rol Server → PSK acordado → **Iniciar servidor**.  
2. En **B**: mismo PSK → Discover o IP de A:48765 → **Conectar**.  
3. PSK incorrecto (opcional smoke): debe fallar auth; luego corregir.  
4. Verificar UI ambos: estado **Connected** (o equivalente), pendientes bajando, sin error permanente.  
5. SQL en A y B: rellenar hoja §1.1 (`device_id`, `device_code` **distintos**).

### Esperado

- Discovery o conexión por IP OK.  
- Auth PSK OK.  
- HTTP auth + WebSocket vivos.  
- `device_id` A ≠ `device_id` B.  
- `device_code` A ≠ `device_code` B.

### Evidencia

- Captura UI Connected A y B.  
- Output SQL settings.  
- IPs anotadas.

---

## TEST B — Venta A → B

**Resultado:** UNTESTED  

### Pasos

1. En **A**, con caja abierta: venta con **≥2 productos** (líneas distintas). Anotar `doc_number`.  
2. En A (SQL o UI):  
   - `sales.sync_id`  
   - cada `sale_items.sync_id` (ninguno NULL/vacío)  
   - `COUNT(sale_items) = N`  
3. Esperar sync (Pendientes → 0 en UI).  
4. En **B**: misma venta (mismo `doc_number` / mismo `sales.sync_id`).  
5. Comparar ítems: mismos `sync_id`, misma cantidad N.  
6. Stock de productos involucrados coherente en B (tras movimientos).  
7. SQL:  
   - A: outbox pending_like = 0  
   - B: `lan_sync_applied` contiene event_ids de esa venta/movimientos  

### Esperado

| Check | OK? |
|-------|-----|
| Venta en B | ☐ |
| N ítems iguales | ☐ |
| Mismos `sale_items.sync_id` | ☐ |
| Stock coherente | ☐ |
| Outbox limpio | ☐ |

### Evidencia

SQL dumps venta+ítems A y B; captura ticket/lista ventas; conteo outbox.

---

## TEST C — Venta B → A

**Resultado:** UNTESTED  

### Pasos

Igual que B, origen **B**, destino **A**.

### Esperado

Simétrico a Test B. `doc_number` con prefijo `device_code` de B.

---

## TEST D — Stock concurrente

**Resultado:** UNTESTED  

Producto: **QA-Agua** (sin variante). Anotar `stock0` sincronizado en A y B.

### Pasos

1. Confirmar mismo `products.sync_id` y mismo stock base en A y B.  
2. **Casi a la vez:**  
   - **A:** venta de **2** unidades de QA-Agua (o ajuste −2 vía flujo que cree `stock_movements`).  
   - **B:** entrada/compra/ajuste **+10** que cree movimiento +10.  
3. Esperar sync + Pendientes 0.  
4. En **ambos** PCs:  
   - `products.stock` final  
   - listar `stock_movements` del producto (deben existir **ambos** movimientos: −2 y +10, con `sync_id` distintos)

### Esperado

- Stock final = `stock0 - 2 + 10` en **A y B**.  
- **No** validar solo el número: deben verse **los dos** movimientos en el ledger local de cada PC (vía sync).  
- No movimiento absoluto `stock = N` como evento de autoridad.

### Evidencia

SQL stock + movements A y B; timestamps.

---

## TEST E — Fiado

**Resultado:** UNTESTED  

Cliente: **QA-Cliente-Fiado**. Balance inicial preferible **0** (anotar si no).

### Pasos

1. **A:** venta fiado / movimiento que sume **+10000** deuda (`customer_balance_movements.delta = +10000`).  
2. Sync.  
3. **B:** movimiento **+5000** deuda sobre el **mismo** cliente (`sync_id` cliente igual).  
4. Sync.  
5. En A y B: `customers.balance` y filas de `customer_balance_movements`.

### Esperado

- `balance = 15000` (si partía de 0).  
- Existen movimientos +10000 y +5000 (no LWW del último valor).  
- `device_id` de cada movimiento coherente con origen.

### Evidencia

SQL customer + movements A/B.

---

## TEST F — Void / update (CRÍTICO)

**Resultado:** UNTESTED  

### Pasos

1. **A:** venta con **N ≥ 2** líneas. Sync a B.  
2. Registrar en hoja:

| Campo | Valor |
|-------|-------|
| `sales.sync_id` | |
| `doc_number` | |
| `event_id` create (outbox/store A) | |
| Ítem 1 `sync_id` | |
| Ítem 2 `sync_id` | |
| … | |
| N | |

3. En **B** antes del void: `COUNT(sale_items) = N`, mismos sync_ids.  
4. **A:** anular (void) o editar la venta (update) según UI.  
5. Anotar **nuevo** `event_id` de void/update en outbox A.  
6. Sync.  
7. En **B:**

```sql
SELECT voided, sync_id FROM sales WHERE sync_id = '...';
SELECT sync_id, name, qty FROM sale_items
WHERE sale_id = (SELECT id FROM sales WHERE sync_id = '...')
ORDER BY id;
SELECT COUNT(*) FROM sale_items
WHERE sale_id = (SELECT id FROM sales WHERE sync_id = '...');
```

### Esperado (PASS solo si todo se cumple)

- Puede haber **nuevo** `event_id` (void/update).  
- `sales.sync_id` **igual**.  
- Cada `sale_items.sync_id` **igual** a los anotados.  
- `COUNT = N` (**no** 2N).  
- `voided = 1` si fue anulación.

### FAIL inmediato si

- Aparecen líneas duplicadas (2N).  
- Ítems con sync_id nuevos distintos a los originales **además** de los viejos.

### Evidencia

SQL before/after A y B; lista sync_ids; capturas.

---

## TEST G — Duplicate delivery

**Resultado:** UNTESTED  

### Objetivo

Mismo `event_id` aplicado como máximo una vez.

### Procedimiento práctico (sin debugger)

1. Elegir un `event_id` ya aplicado en B (`lan_sync_applied`).  
2. Anotar stock/balance/conteo ítems relacionados.  
3. Forzar reentrega:  
   - **Opción 1:** en A, si el evento aún está `sending`, cortar red hasta timeout reclaim y dejar que reintente (peer AlreadyApplied).  
   - **Opción 2 (SQL controlado en hub A, solo DB de prueba):** no borrar applied en B; reinsertar temporalmente outbox en A con **el mismo** `event_id` en `pending` (avanzado; solo QA). Preferir Opción 1.  
4. Tras reintento: en B, `COUNT(*)` en `lan_sync_applied` para ese `event_id` sigue = 1; stock/balance/ítems sin doble efecto.

### Esperado

- No doble stock.  
- No doble balance.  
- No doble sale_items.  
- Segundo apply = no-op (`AlreadyApplied`).

---

## TEST H — Disconnect

**Resultado:** UNTESTED  

### Pasos

1. A y B Connected.  
2. Desconectar red de B (deshabilitar Wi‑Fi/cable o bloquear IP de A).  
3. En **B** (offline): crear ≥3 ventas/movimientos.  
4. Verificar: app usable; UI disconnect; outbox B con `pending`/`sending` > 0.  
5. En A: no deben aparecer aún esas ventas.

### Esperado

POS sigue operativo offline; cola crece; sin crash.

---

## TEST I — Reconnect

**Resultado:** UNTESTED  

### Pasos

1. Restaurar red.  
2. Esperar reconnect + catch-up (UI Syncing → Connected).  
3. Verificar en A las operaciones hechas en B (y viceversa si hubo).  
4. Outbox pending_like = 0 en ambos.  
5. Sin duplicar ventas/ítems/stock.

### Evidencia

Conteos before/after; SQL outbox; capturas estado.

---

## TEST J — ACK lost / retry

**Resultado:** UNTESTED  

### Pasos (aproximación física)

1. Generar tráfico sync (varias ventas en A).  
2. Durante sync, cortar red **muy breve** o cerrar solo el cliente a mitad de “Pendientes” > 0.  
3. Observar en origen filas `sending` → tras ~30s `pending` (reclaim) → reenvío.  
4. Peer: sin duplicados; applied idempotente.  
5. Confirmar que **no** quedan eternamente en `sending`.

### Esperado

Reclaim → retry → acked; sin duplicación.

---

## TEST K — Catch-up ≥500 (~1000)

**Resultado:** UNTESTED  

### Pasos

1. Anotar en hub A: `SELECT COUNT(*) FROM lan_sync_event_store` → `S0`.  
2. En B: anotar `applied` count → `Ap0`.  
3. **Desconectar B**.  
4. En **A**, generar muchos eventos (script manual o repetición):  
   - editar precios/nombres de productos de prueba,  
   - o muchas ventas chicas,  
   - hasta acumular **≥500** eventos nuevos en `lan_sync_event_store` (ideal **~1000**).  
5. Anotar `S1 = COUNT(event_store)` y `Δ = S1 - S0` (≥500).  
6. **Reconectar B**. Esperar catch-up completo (puede tardar).  
7. Verificar:  
   - Pendientes 0  
   - `Ap1 - Ap0` ≈ eventos aplicables recibidos (puede diferir si hay origin filter / propios)  
   - Muestreo: sin ventas duplicadas por `sync_id`  
   - Comparar últimos lamports / cursor catch-up en B

### Registro obligatorio

| Métrica | Valor |
|---------|-------|
| S0 event_store A | |
| S1 event_store A | |
| Δ eventos generados offline | |
| applied B antes | |
| applied B después | |
| Tiempo catch-up | |
| Duplicados detectados | 0 / lista |

### Esperado

Todos los eventos del hub posteriores al cursor de B aplicados una vez; 0 perdidos; 0 duplicados de negocio.

---

## TEST L — Restart

**Resultado:** UNTESTED  

### Pasos

1. Connected.  
2. Reiniciar **solo B** (cerrar proceso WalQo → abrir). Verificar reconnect + catch-up.  
3. Reiniciar **solo A** (server). B debe reconectar cuando A vuelva (backoff).  
4. Outbox limpio; sin pérdida de ventas de prueba.

---

## TEST M — Close during sending

**Resultado:** UNTESTED  

### Pasos

1. Generar cola grande en A o B (varias ventas rápidas).  
2. Con Pendientes > 0 / estado Syncing: **cerrar app** (Alt+F4).  
3. Reabrir.  
4. SQL: no quedar atrapado en `sending` eterno → reclaim a `pending` → envío → `acked`.  
5. Peer consistente; sin duplicados.

---

## 3. Criterio final Phase 0 (físico)

Marcar solo tras tu confirmación explícita por test:

```text
[ ] A Pairing PASS
[ ] B Venta A→B PASS
[ ] C Venta B→A PASS
[ ] D Stock PASS
[ ] E Fiado PASS
[ ] F Void/update PASS
[ ] G Duplicate delivery PASS
[ ] H Disconnect PASS
[ ] I Reconnect PASS
[ ] J Retry PASS
[ ] K Catch-up ≥500 PASS
[ ] L Restart PASS
[ ] M Close/reopen PASS
```

- Si **todos** PASS → se puede declarar **Phase 0 PASS** (documento de cierre, tarea separada).  
- Si **alguno** FAIL o no ejecutado → **NOT READY FOR PHASE 1**.  
- **Prohibido** implementar Cloud / fixes durante la corrida sin autorización tras un FAIL.

---

## 4. Orden de ejecución recomendado

1. Preparación §1 (versión 1.0.10, DB limpia, productos sin variante).  
2. **A** Pairing  
3. **B** Venta A→B  
4. **C** Venta B→A  
5. **F** Void (crítico) — hacerlo temprano  
6. **D** Stock  
7. **E** Fiado  
8. **H** → **I** Disconnect/Reconnect  
9. **J** Retry  
10. **G** Duplicate  
11. **L** Restart  
12. **M** Close during sending  
13. **K** Catch-up masivo (último: más largo)

---

## 5. Bitácora rápida (pegar resultados)

```text
Fecha:
Versión A:
Versión B:
Operador:

A:
B:
C:
D:
E:
F:
G:
H:
I:
J:
K:
L:
M:

Veredicto Phase 0 físico: UNTESTED / PASS / FAIL
NOT READY FOR PHASE 1: SÍ (default hasta PASS completo)
```

---

*Documento operativo Phase 0 — sin PASS por inspección de código. Esperando ejecución física y confirmación del operador.*
