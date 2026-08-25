# Phase 0 — Sync LAN QA Report

*(auditoría de código + tests automatizados existentes; sin prueba física 2-PC en esta pasada)*  
**Fecha:** 2026-08-25  
**Alcance:** Sync LAN actual (`src-tauri/src/lan_sync/*`, migraciones `0021`–`0024`, `src/lib/lanSync.ts`, `src/db/sales.ts` / `customers.ts` / stock)  
**Fuera de alcance:** Cloud, PostgreSQL, API Cloud, cambios de código, fixes, release  

**Gate Phase 0:** **NOT READY FOR PHASE 1**

---

## 1. Executive Summary

Sync LAN es un CDC **hub-and-spoke** (UDP discovery + HTTP auth/catch-up + WebSocket live + PSK). El diseño de **movimientos** para stock y fiado, la **idempotencia por `event_id`**, el **outbox con reclaim**, el **catch-up paginado** y el **apply transaccional por evento** están implementados y cubiertos en gran parte por tests unitarios/hardening.

**No se puede declarar Phase 0 PASS:**

1. **Prueba física 2-PC:** UNTESTED (documentado también en `docs/v1.0.4-lan-physical-checklist.md`).
2. **CRITICAL — `sale_items.sync_id` no se persiste en origen;** `build_sale` genera UUIDs efímeros. En **void/update** (nuevo `event_id`) el peer puede **duplicar líneas**.
3. Varios riesgos HIGH (trigger de ventas sin `lan_sync_enabled`, variants sin CDC, spam de retry en Conflict).

**Conclusión:** la base es sólida para evolucionar a Cloud **después** de fixes priorizados + **PASS físico 2-PC**. Hoy: **NOT READY**.

---

## 2. Current Architecture

```
PC Server (hub)                         PC Client
  UDP announce :48766                     UDP discover
  HTTP :48765  /v1/auth /v1/catchup       HTTP auth + catch-up loop
  WS   /v1/ws  EventBatch ↔ Ack           WS push outbox + apply
  SQLite local                            SQLite local
  lan_sync_event_store (ledger hub)       lan_sync_applied (dedup)
  lan_sync_outbox → store + broadcast     outbox → WS → ACK / reclaim
```

| Pieza | Implementación |
|--------|----------------|
| Roles | `lan_sync_role`: server \| client \| off (`engine.rs`) |
| Device ID | `lan_sync_device_id` UUID estable (`outbox::ensure_device_id`) |
| Device code | `lan_sync_device_code` → `doc_number` `{code}-V-########` |
| PSK | `lan_sync_psk` en `/v1/auth` |
| Net guard | Solo IPs privadas/loopback/link-local |
| Enqueue | Triggers SQL → `lan_sync_outbox` si enabled y no applying |
| Apply | `applier::apply_event` + `lan_sync_applied` |

**Estados outbox:** `pending` \| `sending` \| `acked` \| `failed` (no existe literal `sent`).

---

## 3. Event Identity

| Concepto | Comportamiento actual |
|----------|------------------------|
| `event_id` | `lower(hex(randomblob(16)))` por disparo de trigger |
| `entity_sync_id` | Identidad de entidad cross-device; materialize resuelve `pending-*` |
| Un hecho → un `event_id` | Crear venta = 1 evento `sale` + N `stock_movement` + opcional balance (varios hechos relacionados, no un solo envelope) |
| Void/update venta | **Nuevo** `event_id` (`trg_lan_sales_au` en `0024`), mismo `entity_sync_id` |
| `sales.id` | Solo local; **no** identidad de sync |
| Items | Embebidos en payload de `sale`; deberían llevar `sale_items.sync_id` estable |

**Hallazgo CRITICAL:** `src/db/sales.ts` inserta `sale_items` **sin** `sync_id`. `build_sale` (`outbox.rs` ~583–587) genera UUID **en memoria** y **no lo escribe** en la fila. Cada rematerialize de un evento **distinto** (void/update) puede emitir ítems con sync_ids nuevos → el peer hace INSERT extra.

---

## 4. Idempotency

**Mecanismo:** `lan_sync_applied(event_id PK)`.

Flujo:

1. Si `event_id` ya aplicado → `AlreadyApplied` (ACK-able; avanza cursor).
2. Si no → `BEGIN` → apply → `INSERT OR IGNORE` applied → `COMMIT`.
3. Dependency/Conflict → ROLLBACK apply; pending_apply / conflicts; **no** ACK.

**ACK perdido + resend (mismo `event_id`):** reclaim `sending`→`pending` → reenvío → peer `AlreadyApplied` → **no doble apply del evento**. Cubierto conceptualmente + tests (`audit_ack_idempotent`, AlreadyApplied en applier).

**No alcanza solo el skip de `event_id`:** void/update usa **otro** `event_id` con payload de ítems regenerados → riesgo de duplicar líneas pese a idempotencia de eventos.

**Tests automatizados (código):** PASS parcial.  
**Prueba física ACK loss:** UNTESTED.

---

## 5. Outbox / Retry

| Transición | Código |
|------------|--------|
| pending → sending | `materialize_pending` (+ payload, `attempt_count++`, `sending_at`) |
| sending → pending | `reclaim_stale_sending` (timeout default 30s, clamp 5–600) |
| → acked | `mark_acked` |
| → failed | `mark_failed` + backoff `5 * 2^min(attempt,5)` vía `next_retry_at` |
| failed → pending | reclaim cuando retry due |

**Hub:** al drenar, mete en `event_store` y marca outbox **acked** sin esperar ACK de clientes (entrega a peers = live WS + catch-up).

**Venta sin ítems aún:** materialize **skips** (deja `pending`) hasta que existan ítems — correcto.

**Riesgo atrapado permanente en `sending`:** mitigado por reclaim al listar pending / tick cliente. Crash mid-send → reclaim al reiniciar.

**Conflict/Deferred en origen:** peer no ACK → origen puede reintentar indefinidamente (spam) hasta resolver dependencia/conflicto.

**Tests:** `audit_outbox_reclaim_sending_to_pending` PASS (unit).  
**Físico (corte/reinicio/app close):** UNTESTED.

---

## 6. Catch-up

- Cursor separado: `lan_sync_catchup_lamport` + `lan_sync_catchup_event_id` (`0024`).
- Cliente: `fetch_catchup_all` con `limit=200`, loop hasta `!has_more` / vacío.
- Servidor: `list_event_store_page` clamp **1–500**; **sin techo global silencioso**.
- Reconnect: auth → catch-up completo → WS; `CatchupRequired` → otro catch-up.
- Deferred/Conflict: no avanzan cursor (clamp); hardening tests PASS.

**Test unitario >500:** `audit_catchup_paginates_all_events` (650) PASS in-memory.  
**Test físico 1000 eventos disconnect/reconnect:** UNTESTED.  
**Nota:** `list_pending_apply_events` existe pero **no hay worker** que lo consuma fuera de outbox; recuperación depende de re-fetch / resend.

---

## 7. Transactionality

**Por evento remoto:** una TX SQLite (sale header + items del payload; o movement + `stock += qty`; o balance mov + recalc). Error → ROLLBACK; no `applied`.

**Hecho de negocio local (venta):** en TS, sale + items + stock movements (+ fiado) en TX de app → luego **varios** eventos CDC independientes.

**Implicación:** en el peer puede verse venta aplicada **antes** que el `stock_movement` (consistencia eventual entre eventos). No es “sale_items a medias” dentro de un apply, pero **no** es una sola TX cross-event.

**Simulación error mid-apply LAN:** cubierta por rollback en `apply_event` (código). `acid_tx_tests.rs` = ACID **local**, no wire LAN.  
**Físico:** UNTESTED.

---

## 8. Stock

- `products.stock` **no** se aplica por LWW desde payload de producto (`apply_product` omite stock; INSERT remoto stock=0).
- Trigger product UPDATE **excluye** cambios de stock.
- Verdad: `stock_movements` append + `stock = stock + qty`; duplicate `sync_id` → no-op.

**PASS de diseño + tests unitarios** (deltas paralelos secuenciales, idempotencia movimiento).  
**Gap:** `product_variants.stock` se actualiza en `sales.ts` **sin** trigger LAN → no sync.  
**Físico A −2 / B +10:** UNTESTED.

---

## 9. Customer Balance

- Payload customer **sin** balance; apply no escribe balance absoluto.
- Trigger customer UPDATE **excluye** `balance`.
- Verdad: `customer_balance_movements.delta`; recalc `SUM(delta)`.

**PASS de diseño +** `audit_balance_deltas_sum_to_1500`.  
**Físico +10000 / +5000 → 15000:** UNTESTED.

---

## 10. Sales / Ticket Identity

| Campo | Rol |
|-------|-----|
| `sales.id` | Local only |
| `sales.sync_id` | Identidad sync (ensure en materialize) |
| `doc_number` | `{device_code}-V-########`, UNIQUE |
| Ítems | Deben usar `sale_items.sync_id` estable — **hoy roto en origen** |

Numeración por device: OK si `device_code` único. Colisión de codes → riesgo UNIQUE `doc_number`.

Void test automatizado usa **mismos** item sync_ids en el JSON; **no** reproduce el bug de UUIDs efímeros de `build_sale`.

---

## 11. Disconnect / Reconnect

Cliente: error → Disconnected → backoff 1…30s → reconnect → catch-up → WS.  
Fallo de send WS: `requeue_sending` del batch.  
Hub: sigue drenando a event_store; cliente recupera por catch-up.

**Código:** diseñado para no perder (outbox + store + applied).  
**Físico:** UNTESTED (checklist v1.0.4 también).

---

## 12. Conflict Handling

| Entidad | Estrategia actual |
|---------|-------------------|
| product / customer / category / supplier (ficha) | LWW Lamport → `origin_device` → `updated_at` |
| barcode UNIQUE | Conflict parked + UI resolve/discard |
| stock_movement / balance_movement | Append-only; dedupe por `sync_id` movimiento |
| sale | Upsert por `sales.sync_id`; ítems por `sale_items.sync_id` (sin LWW de venta) |
| Caja / cash_session | **No sync** (local por device) |
| delete | Soft product/customer; hard category/supplier |

No hay merge automático inventado más allá de LWW ficha + movimientos.

---

## 13. Automated Tests

### Existen (útil para Phase 0 parcial)

| Área | Evidencia |
|------|-----------|
| Idempotencia movimiento / AlreadyApplied | `applier`, `tests_sync`, hardening |
| Balance suma (no LWW) | `audit_balance_deltas_sum_to_1500` |
| Stock deltas | `audit_stock_parallel_deltas_correct` |
| Catch-up paginado 650 | `audit_catchup_paginates_all_events` |
| Outbox reclaim | `audit_outbox_reclaim_sending_to_pending` |
| ACK idempotent | `audit_ack_idempotent` |
| Deferred/Conflict / cursor | `hardening_tests` p1/p2 |
| Void actualiza venta (con sync_ids fijos en fixture) | `p5_sale_void_updates_existing_sale` |
| Numbering formato | audit + numbering |

### Faltan (prioridad para cerrar Phase 0 en código)

1. Void/update con `build_sale` real (ítems sin sync_id persistido) → assert **no** duplica líneas.  
2. Persistencia de `sale_items.sync_id` en insert TS / materialize.  
3. Integración WS/HTTP (hoy explícitamente sin axum E2E).  
4. Catch-up 1000 vía servidor HTTP real.  
5. Disconnect/reconnect automatizado (opcional; el gate exige físico).  
6. Concurrente real 2 procesos (opcional).

**No agregar tests en esta pasada** (solo diagnóstico).

---

## 14. Physical 2-PC Test Plan

**PC A = Oficina/Servidor · PC B = Caja/Cliente**  
**Regla:** no marcar PASS por inspección de código.

| ID | Test | Resultado |
|----|------|-----------|
| A | Pairing | UNTESTED |
| B | PSK | UNTESTED |
| C | Discovery UDP | UNTESTED |
| D | Connection WS/HTTP | UNTESTED |
| E | Venta A → B | UNTESTED |
| F | Venta B → A | UNTESTED |
| G | Stock (A −2, B +10) | UNTESTED |
| H | Fiado (+10000 / +5000 → 15000) | UNTESTED |
| I | Disconnect | UNTESTED |
| J | Reconnect + outbox vacío | UNTESTED |
| K | Retry (ACK perdido / corte envío) | UNTESTED |
| L | Duplicate delivery (mismo event_id) | UNTESTED |
| M | Catch-up | UNTESTED |
| N | >500 / ~1000 eventos | UNTESTED |
| O | Restart server/client | UNTESTED |
| P | App close/reopen mid-sending | UNTESTED |
| Q | Void venta en A → líneas en B (no duplicar) | UNTESTED — **priorizar por CRITICAL** |

Evidencia requerida: capturas, versión, IPs, conteos DB (`lan_sync_applied`, outbox pending=0, stock, balance, count sale_items).

---

## 15. Findings

### Matriz de riesgos

| Área | Implementación actual | Riesgo | Severidad | Test requerido |
|------|----------------------|--------|-----------|----------------|
| event_id | UUID por trigger; applied PK | Bajo si mismo id; alto si hechos derivados mal modelados | PASS código / UNTESTED físico | L, K |
| sync_id entidades | Filas + ensure en materialize | Medio si pending mal resuelto | MEDIUM | E, F |
| sale_items.sync_id | NULL en TS; UUID efímero en build_sale | Duplicar líneas en void/update | **CRITICAL** | Q + test auto |
| outbox | pending/sending/acked/failed + reclaim | Timeout OK; Conflict spam | HIGH (spam) | K, P |
| sending→pending | reclaim 30s | OK en código | PASS unit / UNTESTED físico | K, P |
| ACK | AlreadyApplied ACK-able | Hub ACK local ≠ delivery peer | MEDIUM | K, M |
| retry | backoff failed; reclaim sending | Conflict sin techo | HIGH | K |
| catch-up | páginas ≤500, loop completo | Cursor/pending_apply sin worker dedicado | MEDIUM | M, N |
| pagination | has_more + cursor | OK unit 650 | PASS unit / UNTESTED físico | N |
| transactionality | TX por evento | Sale vs stock eventual | MEDIUM | G, E |
| stock | movements only | Variants no sync | HIGH (variants) | G |
| customer balance | movements only | — | PASS diseño | H |
| sales | sync_id + doc_number | Ítems + void | CRITICAL (ítems) | E, F, Q |
| duplicate events | applied by event_id | OK mismo id | PASS unit | L |
| ticket IDs | device_code prefix | Colisión codes | MEDIUM | E, F |
| Lamport | settings + LWW ficha | OK | PASS unit | — |
| LAN disconnect | backoff + catch-up | — | UNTESTED | I, J |
| LAN reconnect | catch-up full | — | UNTESTED | J, M |
| conflicts | LWW / park / movements | Merge-by-name category/supplier | MEDIUM | checklist conflicto |
| device identity | UUID settings | Clonado DB = misma identidad | HIGH si clon | A, O |
| PSK | auth compartida | Débil si PSK trivial | MEDIUM | B |
| server/client | hub-and-spoke | Un solo hub | PASS diseño | A, D |

### Clasificación

| ID | Finding | Clase |
|----|---------|-------|
| F1 | `sale_items.sync_id` no persistido → void/update puede duplicar ítems en peer | **CRITICAL** |
| F2 | Prueba física 2-PC completa ausente | **CRITICAL** (gate) |
| F3 | `trg_lan_sales_au` sin check `lan_sync_enabled` | **HIGH** |
| F4 | `product_variants.stock` fuera de CDC | **HIGH** |
| F5 | Resend infinito en Conflict/Deferred (origen) | **HIGH** |
| F6 | Sale y stock_movement como eventos separados (vista temporal inconsistente) | **MEDIUM** |
| F7 | Hub ACK before client delivery (depende de catch-up) | **MEDIUM** |
| F8 | Posible colisión `device_code` / merge-by-name | **MEDIUM** |
| F9 | `list_pending_apply_events` sin consumer | **MEDIUM** |
| F10 | Idempotencia mismo `event_id` + reclaim + catch-up paginado (unit) | **PASS** (código) |
| F11 | Stock/balance por movimientos (no absolutos) | **PASS** (código) |
| F12 | Apply transaccional por evento | **PASS** (código) |

---

## 16. Required Fixes

*(estado tras implementación controlada P0/P1 en código — **prueba física 2-PC sigue pendiente**)*

1. **P0 — Persistir `sale_items.sync_id`** — **HECHO** (TS insert + `build_sale` persist + migración `0026` backfill). Test: void con sync_id estable no duplica.  
2. **P0 — Ejecutar checklist físico 2-PC** (§14) — **PENDIENTE** (UNTESTED).  
3. **P1 — `trg_lan_sales_au` con `lan_sync_enabled`** — **HECHO** (`0026`).  
4. **P1 — Tope / dead-letter + ACK ConflictParked** — **HECHO** (`MAX_OUTBOX_SEND_ATTEMPTS=20`; wire ACK de conflicto).  
5. **P1 — Variants** — **DOCUMENTADO** como no soportado en LAN (`mod.rs`, `docs/lan-sync-numbering.md`).  
6. **P2 — Tests auto** gaps restantes / worker pending_apply — parcial (tests P0/P1 agregados).  
7. **P2 — Hardening device_code** único al pairar — pendiente.

---

## 17. Phase 0 Gate

| Criterio | Estado |
|----------|--------|
| 2-PC físico PASS | **UNTESTED** |
| Idempotencia PASS | PASS unit; fix P0 void ítems; UNTESTED físico |
| No duplicación PASS | Riesgo CRITICAL **mitigado en código**; UNTESTED físico |
| Outbox/retry PASS | Dead-letter + reclaim; UNTESTED físico |
| Catch-up PASS | PASS unit (>500) / UNTESTED físico |
| Aplicación transaccional PASS | PASS por-evento código / UNTESTED físico |

### Verdict

# **NOT READY FOR PHASE 1**

Fixes P0/P1 de código aplicados en branch. **Falta PASS físico 2-PC** (§14) antes de Cloud Sync productivo.

---

## Apéndice — Qué no se hizo en esta pasada

- No se modificó código productivo.  
- No se creó Cloud / Postgres / API / migraciones.  
- No se alteró `docs/cloud-architecture-proposal.md`.  
- No commit / push / release.  
- Informe de diagnóstico Phase 0 únicamente.
