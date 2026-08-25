# Phase 0.5 — Bootstrap de Catálogo LAN

**Estado:** Propuesta de diseño aprobada conceptualmente (Phase 0.5a) — **sin implementación**  
**Fecha:** 2026-08-25 (rev. 2 — requisitos obligatorios incorporados)  
**Prerrequisito:** Diagnóstico Phase 0 aprobado — LAN conecta OK; CDC incremental post-activación funciona; **no hay bootstrap inicial**.

---

## 1. Problema

Dos PCs con datos existentes (ej. A: 34.000 productos, B: 50 distintos) pueden conectarse por Sync LAN, pero **no convergen a un catálogo común** porque:

- Los triggers CDC solo encolan cambios **después** de `lan_sync_enabled = '1'`.
- La migración 0021 asigna `sync_id` a filas existentes, pero **no genera eventos** ni los inserta en `lan_sync_event_store`.
- La UI promete sincronizar “productos, categorías…” sin distinguir **histórico vs cambios futuros**.

**Objetivo Phase 0.5:** procedimiento explícito de **sincronización inicial** que una catálogos **sin wipe**, **sin merge silencioso**, identidad por **`sync_id`**, y deje operativo el CDC **bidireccional** después.

---

## 2. Modelo actual

```
Cambio DB (LAN ON) → trigger → lan_sync_outbox → materialize → LAN
  Servidor: drain → lan_sync_event_store + broadcast WS
  Cliente:  WS push → servidor ingest → event_store + broadcast
Peer: apply_event → lan_sync_applied (dedup por event_id)
Catch-up: GET /v1/catchup desde lan_sync_event_store (paginado)
```

| Pieza | Rol |
|-------|-----|
| `sync_id` | Identidad de **entidad** cross-device |
| `event_id` | Idempotencia de **entrega** |
| `lan_sync_outbox` | Cola saliente local (**Outbox** en UI) |
| `lan_sync_event_store` | Ledger del hub |
| `lan_sync_applied` | Eventos ya aplicados |
| `lan_sync_pending_apply` | **Deferred** en destino |
| `lan_sync_conflicts` | **Conflictos** explícitos |

**No existe hoy:** bootstrap, snapshot, full catalog export, reconciliación guiada.

**Legacy incompatible con Phase 0.5:** merge-by-name en `apply_category` / `apply_supplier` — **prohibido** en bootstrap y objetivo a eliminar en CDC normal.

---

## 3. Entidades involucradas

### 3.1 Alcance bootstrap Phase 0.5a

| Tabla | sync_id | CDC hoy | Bootstrap 0.5a |
|-------|---------|---------|------------------|
| **categories** | Sí | Sí | **Sí** |
| **suppliers** | Sí | Sí | **Sí** |
| **products** (simples) | Sí | Sí (ficha; no stock) | **Sí** |
| **products** (con variants) | Sí | Parcial | **Sí ficha producto; variants excluidas** (§5) |
| **customers** | Sí | Sí (ficha) | **Sí** |
| **brands** | No | No | Fuera 0.5a (`brand_id` queda local/null en peer) |
| **product_variants** | No | No | **No** — Phase 0.6 |
| **product_barcodes**, **kits**, **batches** | No | No | Fuera 0.5a |
| **stock_movements** | Sí | Sí | **No** en bootstrap |
| **sales** / histórico | Sí | Sí | **No** en bootstrap |

### 3.2 Orden de dependencias

```
categories → suppliers → products → customers
```

### 3.3 Identidad (requisito obligatorio §6)

- **`sync_id` = única identidad cross-device.**
- **`id` local**, nombre, SKU, barcode: **nunca** identidad de sync.
- Nombre / SKU / barcode: solo **detección de posible conflicto** → `lan_sync_conflicts`.
- **Prohibido:** merge silencioso por nombre, SKU o barcode.

---

## 4. Product variants (requisito §5)

### 4.1 Qué vive dónde

| Dato | `products` | `product_variants` |
|------|------------|---------------------|
| Ficha, categoría, precio base | ✓ | override precio |
| Stock POS | ✓ (suma) | ✓ por variante |
| Venta | producto simple | `sale_items.variant_id` local |

### 4.2 Política Phase 0.5a

| Caso | Comportamiento |
|------|----------------|
| Producto **sin** variantes (`has_variants = 0`) | Bootstrap **normal** |
| Producto **con** variantes (`has_variants = 1`) | **No bloquea** el bootstrap global |
| Variants en bootstrap | **Excluidas** — no se exportan/importan |
| UI previa | Mostrar: *“N productos tienen variantes — stock/precio por variante no se sincroniza hasta Phase 0.6”* |
| Ficha del producto padre | **Sí** entra (nombre, precio base, categoría, etc.) |
| Stock variantes | **No** — Phase 0.6 |

### 4.3 Phase 0.6 (futuro, documentado)

- `product_variants.sync_id` + CDC + bootstrap variants + movimientos por variante.

---

## 5. Rol del servidor (requisito §2)

### 5.1 Servidor = fuente **inicial**, no autoridad permanente

| Fase | Rol del servidor |
|------|------------------|
| **Bootstrap fase 1** | **Fuente inicial** del snapshot/eventos históricos (A → todos los clientes) |
| **Bootstrap fase 2** | **Receptor** de contribución obligatoria de clientes (B → A) |
| **Post-bootstrap** | **Hub simétrico** — igual que hoy: cualquier PC crea/modifica; todos los eventos se propagan vía `event_store` |

**Después de completar bootstrap:**

- Servidor puede crear/modificar → clientes reciben.
- Cliente puede crear/modificar → servidor recibe → broadcast → otros clientes reciben.
- **No** hay “solo el servidor manda catálogo”.

### 5.2 Contribución de clientes — **obligatoria** (requisito §3)

Escenario gate:

```
PC A (servidor): 34.000 productos
PC B (cliente):     50 productos únicos (sync_id ∉ A)
```

**Secuencia obligatoria:**

1. **Bootstrap A → B** — B importa catálogo base de A (34.000).
2. **Contribución B → A** — B exporta entidades cuyo `sync_id` **no existe** en el manifest/generation del hub; A aplica.
3. **Resultado:** A = **34.050**, B = **34.050** (unión por sync_id, sin merge silencioso).

Luego CDC normal bidireccional:

- B crea producto X → A (y demás peers) reciben.
- A crea producto Y → B recibe.

**Gate Phase 0.5:** contribución cliente **no es opcional** — tests C y escenario 34k+50 lo exigen.

---

## 6. Ordering, generation y cambios concurrentes (requisito §1)

### 6.1 Problema a evitar

```
❌ PROHIBIDO:
  operador edita precio durante bootstrap (evento CDC real, lamport alto)
  → luego aplica bootstrap viejo (generation anterior)
  → rollback accidental del precio
```

### 6.2 Modelo de ordering

Cada evento en `lan_sync_event_store` lleva:

```
bootstrap_generation : integer   // 0 = CDC normal post-bootstrap; ≥1 = sesión bootstrap
lamport              : integer   // reloj lógico global (monótono en hub)
event_id             : unique
created_at           : timestamp // auditoría, no autoridad
```

**Reglas de orden de aplicación en peer:**

1. Ordenar por **`(lamport ASC, event_id ASC)`** — igual que catch-up hoy.
2. Un evento con **`lamport = L1`** siempre gana sobre snapshot bootstrap con **`lamport = L0`** si `L1 > L0` para la **misma entidad** (`entity_sync_id`) vía política LWW del applier.
3. **`bootstrap_generation`** es metadata de sesión/procedencia — **no invierte** un lamport mayor.

### 6.3 Estrategia durante bootstrap activo

**Estados:**

```
bootstrap_status: off | exporting | importing | contributing | complete | failed
```

**Mientras `bootstrap_status ≠ complete` en una PC:**

| Actor | Comportamiento |
|-------|----------------|
| **Hub (servidor)** | Export scan con **`lan_sync_applying = 1`** (sin triggers). Asigna lamport secuencial **`B1…Bn`** reservando rango `[bootstrap_lamport_start, bootstrap_lamport_end]`. |
| **Cambios operativos (usuario)** | **Permitidos** — encolan en outbox con lamport **`> bootstrap_lamport_end`** (reservar rango al iniciar bootstrap). |
| **Import en cliente** | Aplica eventos bootstrap **`B1…Bn`** en orden. |
| **CDC concurrente** | Outbox drena **después** de eventos bootstrap en el store, o con lamport superior — **nunca sobrescribe** un cambio posterior. |

**Reserva de lamport (garantía clave):**

```
Al iniciar bootstrap sesión G:
  bootstrap_lamport_start = current_lamport + 1
  bootstrap_lamport_end   = bootstrap_lamport_start + estimated_events - 1
  CDC_live_lamport_min      = bootstrap_lamport_end + 1

Triggers/outbox durante bootstrap usan lamport ≥ CDC_live_lamport_min
Eventos bootstrap usan lamport ∈ [bootstrap_lamport_start, bootstrap_lamport_end]
```

**Orden final en event_store:**

```
bootstrap events (lamport B1…Bn)
→ live CDC events (lamport > Bn)
→ CDC normal post-complete
```

**Apply en peer:** si llega evento live con lamport mayor que el último bootstrap aplicado para esa entidad, **LWW acepta live** — no rollback.

### 6.4 Cierre de bootstrap

Al marcar `bootstrap_status = complete`:

- Fijar `lan_sync_bootstrap_generation = G`.
- Fijar `CDC_live_lamport_min` como lamport actual.
- Reanudar drenado outbox normal.
- Catch-up cursor avanza solo con eventos **aplicados** (sin retroceso).

### 6.5 Diagrama

```
Tiempo →

[Export bootstrap G]     lamport 1001…35000  (histórico congelado en scan)
[Usuario cambia precio]  lamport 35001       (CDC live, durante bootstrap)
[Import cliente]         aplica 1001…35000, luego 35001
                         → precio final = valor de 35001 ✓

Nunca: 35001 aplicado → 1001..35000 pisa precio ✗
        (LWW + lamport ordering lo impide)
```

---

## 7. Opción recomendada: Phase 0.5a — Bootstrap por eventos

### 7.1 Por qué eventos primero

- Reutiliza `SyncEvent`, applier, `event_store`, catch-up.
- Compatible Cloud (§10).
- Contribución cliente = mismos eventos `bootstrap_upsert`.
- Phase 0.5b (snapshot chunks) optimiza transporte sin cambiar ordering.

### 7.2 Protocolo resumido

```
FASE 1 — Export servidor (fuente inicial A)
  Scan categories → suppliers → products → customers
  INSERT event_store (op: bootstrap_upsert, generation: G, lamport reservado)
  Manifest: { generation, counts, sync_id_set_hash, lamport_range }

FASE 2 — Import clientes (A → B)
  Catch-up paginado streaming (chunks transporte 200 eventos)
  Apply batch 50–100 por transacción SQLite
  Cursor persistido para resume

FASE 3 — Contribución obligatoria clientes (B → A)
  Cliente exporta sync_ids ∉ manifest_A
  Hub aplica → event_store (generation: G, lamport > prior)
  Todos los peers catch-up → unión 34.050

FASE 4 — bootstrap_status = complete
  CDC bidireccional normal
```

---

## 8. Batch / performance (requisito §4)

### 8.1 Prohibido

- **Un commit SQLite por entidad** durante import bootstrap.

### 8.2 Obligatorio

| Capa | Tamaño | Notas |
|------|--------|-------|
| **Transporte (catch-up)** | **200 eventos/página** (existente) | HTTP streaming; no cargar 34k en RAM |
| **Apply SQLite** | **50–100 eventos/transacción** | `BEGIN…COMMIT` por batch; rollback batch ante error |
| **Export scan** | **500–1000 filas/buffer lectura** | Cursor por tabla; escribir event_store en sub-batches |
| **Memoria peer** | **≤ 1 página + 1 apply batch** en RAM | ~200 eventos × ~1 KB ≈ 200 KB + overhead |

### 8.3 Métricas objetivo (34.000 productos, LAN)

| Métrica | Objetivo | Límite aceptable |
|---------|----------|------------------|
| Tiempo export servidor | < 2 min | 5 min |
| Tiempo import cliente | < 10 min | 20 min |
| Contribución 50 productos | < 30 s | 2 min |
| RAM pico cliente | < 100 MB extra | 200 MB |
| Tamaño event_store | ~15–30 MB | 50 MB |
| Páginas catch-up | ~175 (@200 evt) | — |

### 8.4 Optimizaciones permitidas (0.5a)

- Pausar rebuild FTS durante import; reindex al final.
- `PRAGMA synchronous = NORMAL` solo en sesión bootstrap (restaurar después).
- Índice `sync_id` ya existe — validar planes de query.

### 8.5 Phase 0.5b (futuro)

- Snapshot comprimido por chunks para transporte; **mismo ordering lamport/generation**.

---

## 9. Interrupción y resume (requisito §7)

### 9.1 Escenario

```
Import al 40% → WiFi cae → app cierra → reconecta → continúa
```

### 9.2 Persistencia (cliente)

```
lan_sync_bootstrap_session_id
lan_sync_bootstrap_generation
lan_sync_bootstrap_cursor: { last_lamport, last_event_id }
lan_sync_bootstrap_counts: { applied_by_entity_type }
```

### 9.3 Resume

1. Re-auth LAN.
2. `GET /v1/bootstrap/status` — comparar generation del hub.
3. Si generation igual: catch-up desde `(last_lamport, last_event_id)`.
4. Apply idempotente: `lan_sync_applied(event_id)` → **sin duplicar filas**.
5. Si generation del hub avanzó (re-bootstrap explícito): UI pregunta — **no auto-sobrescribir**.

### 9.4 Sin duplicación

- Dedup por **`event_id`** (entrega).
- Upsert por **`sync_id`** (entidad).
- Re-aplicar batch completo tras crash: **seguro**.

---

## 10. Conflictos (requisito §6, §8 H/I)

### 10.1 Mismo barcode, distintos sync_id (Coca AAA / Coca BBB)

- **Detección** al apply bootstrap/CDC.
- **ConflictParked** — no merge.
- **Ambas entidades pueden coexistir** (BBB insert falla barcode UNIQUE → conflicto explícito; AAA intacto).
- UI: reconciliación humana posterior.

### 10.2 Categoría mismo nombre, distintos sync_id

- **Strict sync_id:** dos filas categoría.
- **Prohibido** merge-by-name durante bootstrap (y CDC objetivo).

### 10.3 Mismo sync_id

- Upsert / LWW por lamport + `updated_at`.

---

## 11. Stock y ventas (requisitos §9 J/K)

| Dato | Bootstrap |
|------|-----------|
| **Stock absoluto** | **NO** — `apply_product` inserta stock=0; updates no tocan stock |
| **Stock real** | Solo vía **`stock_movements`** post-bootstrap |
| **Ventas históricas** | **NO** entran en bootstrap |
| **Balance cliente** | **NO** — solo ficha; balance vía movements post-bootstrap |

---

## 12. Contadores UI (requisito §8)

**Prohibido** mezclar todo en un solo “Pendientes”.

| Contador UI | Fuente técnica | Cuándo |
|-------------|----------------|--------|
| **Bootstrap** | cursor import/export sesión G | Durante sync inicial |
| **Outbox** | `lan_sync_outbox` WHERE status IN (pending, sending, failed) | CDC normal |
| **Deferred** | `lan_sync_pending_apply` | Apply remoto pendiente dependencia |
| **Conflicts** | `lan_sync_conflicts` WHERE status=open | Siempre visible si >0 |

**Barra inferior — bootstrap activo:**

```
Sync LAN · Sincronización inicial 62%
Bootstrap: 21.400/34.216 productos | Outbox: pausado | Deferred: 0 | Conflictos: 3
```

**Barra inferior — post-bootstrap:**

```
Sync LAN · Conectado (cliente) | Bootstrap: completo ✓ | Outbox: 0 | Deferred: 0 | Conflictos: 0
```

**Durante bootstrap:** Outbox CDC muestra **“pausado”** o contador separado — no sumar a Bootstrap.

---

## 13. Gate Phase 0.5 — tests obligatorios (requisito §9)

Todos **UNTESTED** hasta ejecución física o integration automatizada documentada.

| ID | Test | Criterio PASS |
|----|------|---------------|
| **A** | 34k + 50 → bootstrap | A = 34.050, B = 34.050 (mismos sync_ids en ambas) |
| **B** | A crea producto | B lo ve en Productos |
| **C** | B crea producto | A lo ve |
| **D** | A modifica precio | B refleja precio |
| **E** | B modifica ficha | A refleja cambio |
| **F** | Disconnect @ 40% import | Resume sin duplicar; conteo final correcto |
| **G** | Mismo event_id dos veces | `lan_sync_applied` — una sola fila entidad |
| **H** | Mismo barcode, distintos sync_id | Conflicto explícito; no merge silencioso |
| **I** | Categoría mismo nombre, distintos sync_id | Dos categorías; no merge-by-name |
| **J** | Stock | Tras bootstrap, stock no copiado; movimiento en A afecta stock vía movement |
| **K** | Ventas históricas | No aparecen en peer tras bootstrap |

**Gate Phase 0.5 = PASS** solo si A–K PASS con evidencia.

**Contribución B→A (test A subcondición):** obligatoria, no opcional.

---

## 14. Compatibilidad Cloud (requisito §10)

El bootstrap LAN debe ser **conceptualmente reutilizable** para bootstrap de un dispositivo Cloud futuro.

| Concepto | LAN bootstrap | Cloud futuro |
|----------|---------------|--------------|
| `sync_id` | Identidad entidad | Igual |
| `event_id` | Idempotencia entrega | Igual |
| `lan_sync_event_store` | Ledger hub local | Proyección / ledger Cloud |
| `bootstrap_generation` | Sesión bootstrap G | `catalog_generation` tenant |
| Lamport ordering | Reserva rango + CDC live | Mismo modelo |
| Idempotency | `lan_sync_applied` | Mismo patrón |
| Bootstrap transport | Catch-up HTTP (0.5a) | Snapshot + event replay |

**Principio Cloud (doc existente):** Cloud recibe ledger de eventos; bootstrap LAN **puebla** el ledger inicial — no es camino paralelo permanente.

---

## 15. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Rollback por ordering incorrecto | Reserva lamport + LWW (§6) |
| Servidor como dictador permanente | Hub simétrico post-bootstrap (§5) |
| 50 productos B perdidos | Contribución obligatoria (§5.2) |
| 34k lento | Batches apply + streaming (§8) |
| Variants | Advertir N productos; no bloquear (§4) |
| merge-by-name legacy | Strict sync_id bootstrap |
| Outbox pre-bootstrap atascado | Contador Outbox separado post-complete |
| Clon DB mismo device_id | Validar antes de bootstrap |

---

## 16. Plan de implementación (sin ejecutar)

### Phase 0.5a — MVP

1. Settings bootstrap + reserva lamport + generation.
2. Export servidor → event_store (`bootstrap_upsert`).
3. Import cliente streaming + apply batch 50–100.
4. **Contribución cliente obligatoria** → hub → todos los peers.
5. UI wizard + contadores separados (§12).
6. Strict sync_id apply (sin merge-by-name).
7. Variants: contar, advertir, excluir del payload variant.
8. Tests integration A–K (automation donde sea posible).
9. Runbook físico 34k+50.

### Phase 0.5b — Snapshot transport (performance)

- Chunks comprimidos; mismo ordering/generation.

### Phase 0.6 — Variants CDC + reconciliación UI

---

## 17. Impacto Phase 0

| Item | Estado |
|------|--------|
| Conexión LAN | PASS (observado) |
| CDC incremental Caso A | PASS con catálogo común |
| Catálogo histórico sin bootstrap | FAIL by design |
| Phase 0 gate (original) | **NOT READY** |
| **Phase 0.5 gate (A–K)** | **UNTESTED** — bloqueante para catálogos reales divergentes |
| Cloud | Después de Phase 0.5 + LAN 2-PC PASS |

**No declarar Phase 0 PASS** con catálogos preexistentes divergentes sin Phase 0.5 PASS.

---

## Apéndice A — UI “Sincronización inicial”

### Pantalla previa (servidor)

```
┌─ Sincronización inicial de catálogo ─────────────────────┐
│ Esta PC (Servidor) es la fuente del catálogo INICIAL.    │
│ Después, todas las PCs podrán crear y editar.            │
│ No se borrarán datos.                                    │
│                                                          │
│ En esta PC:        34.216 productos · 482 categorías … │
│ Cliente Caja 1:        50 productos (únicos estimados)   │
│                                                          │
│ ⚠ 0 productos con variantes no soportadas (Phase 0.6)    │
│ ⚠ Marcas: no incluidas en 0.5a                         │
│ ⚠ Ventas históricas: no se sincronizan                 │
│                                                          │
│ Tras bootstrap: contribución obligatoria del cliente.    │
│                                                          │
│ [ Cancelar ]  [ Iniciar sincronización ]               │
└──────────────────────────────────────────────────────────┘
```

### Progreso

```
Fase 2/3: Importando en Caja 1 (62%)
Bootstrap: 21.400/34.216 productos
Contribución pendiente: Caja 1 → servidor (50 productos)
Outbox: pausado | Deferred: 0 | Conflictos: 3 [Ver]
```

---

## Apéndice B — Reglas consolidadas (checklist diseño)

- [ ] `sync_id` = identidad; nunca nombre/SKU/barcode
- [ ] Servidor = fuente inicial; hub simétrico después
- [ ] Contribución cliente obligatoria (34k+50 → 34.050)
- [ ] Ordering: bootstrap lamport range < CDC live lamport
- [ ] Cambios durante bootstrap no se pierden (LWW + lamport)
- [ ] Apply batch 50–100; transporte 200/página; streaming
- [ ] Variants: advertir, no bloquear; Phase 0.6
- [ ] Resume @ 40% sin duplicar
- [ ] UI: Bootstrap / Outbox / Deferred / Conflicts separados
- [ ] Gate A–K definido
- [ ] Cloud: sync_id, event_id, event_store, generation, idempotency
- [ ] Stock no absoluto; ventas no en bootstrap

---

*Fin del documento — rev. 2. Sin implementación de código.*
