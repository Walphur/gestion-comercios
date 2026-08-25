# WalQo Cloud Architecture Proposal

*(revisión B — ajustes aprobados incorporados; documento conceptual, sin implementación)*

## 1. Executive Summary

WalQo evoluciona a una arquitectura híbrida **Desktop + Cloud + Web** sin convertir el POS en una app web.

- **Desktop (Tauri + SQLite)** sigue siendo la **autoridad operativa** en las primeras fases: ventas, caja, stock, productos, clientes, periféricos, offline.
- **Cloud** **recibe y persiste el ledger de eventos** de la empresa y **construye proyecciones consultables** para la Web. No es aún autoridad de catálogo.
- **Web Owner Portal** arranca **estrictamente READ-ONLY**.
- Un solo producto / una sola empresa / catálogo genérico (unidad y kg vía `unit` + qty).

**Principio de sync:** eventos/movimientos, no estados absolutos conflictivos (`stock = 27`). Idempotencia **transversal al transporte**: el mismo `event_id` se aplica **como máximo una vez**, llegue por LAN o por Cloud.

**Prerrequisito duro antes de Cloud Sync productivo:** Sync LAN físico 2-PC **PASS**, con énfasis en idempotencia y no duplicación.

---

## 2. Current Architecture

### Desktop hoy

```
Tauri → React → SQLite (gestion.db, migraciones SQL 0001–0025)
Dominio TS (src/db) + Rust crítico (caja, audit, license, lan_sync)
```

### Tres caminos de sync actuales (ortogonales)

| Sistema | Qué hace |
|---------|----------|
| **Sync LAN** | CDC hub-and-spoke: outbox, event_store, Lamport, `event_id`, stock/balance por deltas |
| **Workshop/Drive** | JSON en carpeta (customers + módulos Pro) |
| **sync_worker** | Cola fiscal ARCA online |

### Reutilizar

- Modelo `SyncEvent` (`event_id`, `entity_sync_id`, `lamport`, `origin_device`, payload)
- Stock y fiado como movimientos
- `sync_id` estable (no `sales.id` local como identidad)
- Licencia + `machine_id` + `max_devices`
- Accounts email/OTP en `license-api`
- Intelligence local: **WalQo calcula, la IA interpreta**

### No reescribir

- Sync LAN core (solo QA + bugs de integridad)
- SQLite operativo del POS
- Cálculo local de métricas/alertas/acciones

---

## 3. Target Architecture

```
                 ☁️ WALQO CLOUD
         Auth · Companies · Devices
         Event Store (inmutable)
         Applied Events (idempotencia)
         Projections (derivadas)
         Sync API · Query API
                       │
          ┌────────────┼────────────┐
          │            │            │
   WALQO DESKTOP   WALQO WEB    Workers existentes
   SQLite local    Owner Portal  (license / BI interpret)
   autoridad       READ-ONLY
   operativa       (fases iniciales)
          │
          └── Sync Engine ──┐
               ↙            ↘
            LAN           Cloud
         (local rápido)  (ledger + proyecciones)
```

### Frase canónica (reemplaza “Cloud consolida”)

> **Cloud recibe y persiste el ledger de eventos de la empresa y construye proyecciones consultables para Web.**

### Autoridad operativa (fases iniciales)

| Capa | Rol |
|------|-----|
| Desktop SQLite | **Autoridad operativa** (catálogo, stock proyectado local, ventas, caja) |
| Cloud Event Store | **Ledger inmutable** de lo que las cajas ya hicieron |
| Cloud Projections | **Vistas derivadas** para consulta Web (no autoridad de escritura POS) |
| Web | **Solo lectura** hasta Phase 6 |

**No** convertir Cloud en autoridad de catálogo en Phase 1–5.

---

## 4. Data Ownership

| Dominio | Autoridad operativa (Phase 1–5) | Cloud | Quién escribe | Sync | Conflictos | Offline |
|--------|----------------------------------|-------|---------------|------|------------|---------|
| Productos / precios | **Desktop** | Copia en ledger + proyección lectura | Desktop | Eventos upsert | LWW ficha (LAN); Cloud no impone catálogo aún | Sí |
| Stock | Desktop proyección; verdad = movimientos | Ledger de movimientos + proyección | Solo vía movimientos | Append-only | Idempotencia `event_id` / `sync_id` mov. | Sí |
| Ventas | Desktop origen | Ledger + proyección | Desktop | `sale` + stock movs | Dedupe `event_id` | Sí |
| Clientes ficha | Desktop | Ledger + proyección | Desktop | Upsert `sync_id` | LWW ficha | Sí |
| Saldos / fiado | Movimientos Desktop | Ledger movimientos | Desktop | balance mov. | Idempotencia | Sí |
| Caja | **Local por device** | Proyección de cierres (Phase 4+) | Desktop | Eventos de cierre/movs (más adelante) | No merge sesiones abiertas | Sí |
| Config local | Desktop | Selectivo más adelante | Desktop | Limitado | Desktop gana en operativo | Sí |
| Licencia / devices | Cloud license-api | Cloud | API | Ya existe | Server | Grace offline |
| Intelligence | **Desktop calcula** | Projections leídas; mismas fórmulas | Local | Datos base sync; no “otra matemática” | N/A | Sí |
| IA | Worker interpreta | Igual | Worker | Request | N/A | Cache |

---

## 5. Event Store vs Projections (separación explícita)

### Event Store (inmutable)

- Append-only.
- Guarda el envelope del evento (`event_id`, tipo, payload, `origin_device`, `lamport`, `occurred_at`, …).
- **No se edita** un evento pasado; se corrige con nuevos eventos (void, ajuste, etc.).
- Fuente del ledger de la empresa.

### Applied Events / Idempotency

- Registro de `event_id` ya aplicados (local y cloud).
- Garantiza: **aplicar ≤ 1 vez por destino lógico**, sin importar el transporte.

### Projections (derivadas)

- Tablas/vistas calculadas desde el Event Store (ventas del día, stock estimado, listados portal).
- Se pueden **rebuild** desde el ledger.
- **No** son la autoridad de escritura del POS.
- Cualquier métrica en proyección Cloud debe usar las **mismas definiciones de negocio** que Desktop (ver §6b).

```
Event Store  ──(reduce/apply)──►  Projections  ──►  Query API  ──►  Web
     ▲
     │
  Sync API (push desde Desktop)
```

---

## 6. Event Model

Reutilizar `SyncEvent` LAN:

- `event_id`, `entity_type`, `entity_sync_id`, `op`, `payload`, `lamport`, `origin_device`, `created_at`

Extensión Cloud (server-side / envelope):

| Campo | Quién lo pone |
|-------|----------------|
| `company_id` | **Solo servidor**, desde token/device autenticado — **nunca confiar en el cliente** |
| `branch_id` | Nullable (futuro); server/device registry |
| `device_id` | Del device autenticado |
| `schema_version` | Cliente + validación server |
| `ingested_at` | Servidor |

Entidades Phase 2–3 (push/pull): product, category, supplier, customer, sale, stock_movement, customer_balance_movement.  
Más adelante: void/update sale endurecidos, caja cierre, purchases, Pro modules.

**Prohibido como autoridad:** `products.stock = N`, `customers.balance = N`.

---

## 6b. Fórmulas de negocio consistentes (requisito)

Cloud **no** puede calcular métricas con reglas distintas a Desktop.

- Definir un **catálogo de fórmulas** versionado (ticket promedio, margen estimado, stock bajo mínimo, ganancia del período, etc.).
- Desktop Intelligence y Cloud Projections / Query API deben referenciar la **misma definición** (documentada + idealmente shared package o tests de paridad).
- Materio intacto: **LA IA INTERPRETA. WALQO CALCULA.**  
  Cloud puede calcular proyecciones, pero con las **mismas reglas** que el motor local; la IA no redefine números.

---

## 7. Event IDs / Idempotency (transversal al transporte)

### Regla de oro

> Un mismo `event_id` se aplica **como máximo una vez** en un destino dado, **independientemente** de si el evento llegó por **LAN**, por **Cloud**, o por ambos.

### Implicaciones

1. Desktop outbox genera **un** `event_id` por hecho de negocio.
2. LAN y Cloud pueden transportar el **mismo** `event_id`.
3. Cada peer mantiene `applied_events` (o equivalente):
   - Local: `lan_sync_applied` (hoy) → generalizar concepto a “aplicado sin importar origen”.
   - Cloud: `applied_events(company_id, event_id)`.
4. Reinyección Cloud → Desktop y fan-out LAN no deben doble-aplicar.
5. ACK idempotente si el `event_id` ya existe.

Identidad de entidades: `sync_id`, no AUTOINCREMENT local.  
Numeración comercial: `{device_code}-V-…` (ya existe).

---

## 8. Sync Protocol (conceptual)

### Sync API

- `POST /v1/sync/push` — device autentica; body = batch de eventos **sin** `company_id` confiable del cliente.
- `GET /v1/sync/pull?cursor=` — eventos de la empresa para ese device (excluyendo los propios ya conocidos / origin filter).

Servidor:

1. Resuelve `company_id` + `device_id` **solo del token**.
2. Persiste en Event Store.
3. Registra Applied/Idempotency.
4. Actualiza Projections (async o sync controlado).
5. Devuelve ACK + cursor.

### Query API

- Endpoints de lectura para Owner Portal (dashboard, ventas, stock, etc.) sobre **Projections**.
- Autenticación de usuario cloud (owner); autorización read-only en Phase 4.
- Métricas alineadas al catálogo de fórmulas (§6b).

---

## 9. LAN + Cloud coexistence

### Objetivo de fase (Phase 5, no antes del push/pull estable)

Dual transport desde el origen:

```
Escritura SQLite
  → 1 evento / 1 event_id en outbox
  → LAN (si habilitado)
  → Cloud (si habilitado)
```

Hasta Phase 5: se puede desarrollar Push y Pull Cloud **sin** exigir dual fan-out completo en producción (ver fases).

### Anti-duplicación

- Mismo `event_id` en todos los caminos.
- Applied store transversal.
- Filter `origin_device` en pull.
- No mezclar Workshop Drive y Cloud Sync sobre las mismas entidades sin plan de apagado.

---

## 10. Offline behavior

- Sin internet: cajas 100% operativas en SQLite.
- Outbox Cloud acumula; al volver, push ordenado.
- Cobro **nunca** bloqueado por Cloud.
- Licencia: grace offline existente.

---

## 11. Conflict Resolution

| Caso | Estrategia |
|------|------------|
| Mismo `event_id` otra vez | No-op + ACK |
| Ficha producto/cliente | LWW Lamport+device (como LAN); Desktop operativo |
| UNIQUE barcode | Park + resolución UI |
| Stock | Solo ledger de movimientos |
| Caja | Local por device; cloud = proyección de cierres |

---

## 12. Multi-Tenant Architecture

```
companies
devices (machine_id, company_id, status)
company_users (owner/viewer…)
event_store (append-only, company_id server-side)
applied_events (company_id, event_id)
projections_* (derivadas, company_id)
branches (Phase 7, nullable antes)
```

Aislamiento: toda query scoped por `company_id` del auth context.  
Catálogo genérico: categorías/secciones, no forks por cliente.

---

## 13. Cloud Components (explícitos)

| Componente | Responsabilidad |
|------------|-----------------|
| **Auth** | Device tokens (sync) + user sessions (portal); ligado a license/accounts existentes |
| **Companies** | Tenant empresa; aislamiento |
| **Devices** | Registro alineado a `max_devices` / `machine_id`; revoke/unlink |
| **Event Store** | Ledger inmutable de eventos de la empresa |
| **Applied Events / Idempotency** | `event_id` único aplicado; transversal a transportes |
| **Projections** | Vistas derivadas rebuildables; mismas fórmulas que Desktop |
| **Sync API** | Push/pull de eventos para Desktop |
| **Query API** | Lectura para Owner Portal (y luego writes en Phase 6) |

---

## 14. Device Management

- Reutilizar `max_devices` y activations de license-api.
- Sync Auth exige device activo.
- Portal: listar devices, último push, pendientes.
- Unlink self-serve / admin (hoy falta; planear en Foundation).

---

## 15. Authentication / Authorization

- **Desktop POS:** PIN/roles locales (sin cambio de modelo).
- **Device → Cloud:** token derivado de license + machine; `company_id` **solo server-side**.
- **Owner Web:** account login; Phase 4 = **READ-ONLY** (sin mutaciones de negocio).
- Phase 6: writes Web con roles explícitos.

---

## 16. Web Owner Portal

### Phase 4 — estrictamente READ-ONLY

Login, empresa, devices, dashboard, ventas, stock, productos, clientes, movimientos, alertas, vista de inteligencia **en lectura** (datos/proyecciones; sin redefinir fórmulas).

### Fuera de alcance hasta Phase 6+

POS, cobro, impresión local, escrituras de catálogo/stock desde Web.

---

## 17. Multi-Branch Future (Phase 7)

- `branch_id` nullable desde el diseño de eventos/devices.
- Stock por `(company, branch, product_sync_id)`.
- No implementar antes de portal + dual transport estables.

---

## 18. Security

- `company_id` **nunca** confiado desde el cliente.
- TLS en Cloud; LAN PSK solo LAN.
- Idempotencia anti-replay de eventos.
- Device bind + revoke.
- Portal: sesión segura; solo lectura Phase 4.
- No subir PINs locales a Cloud.

---

## 19. Infrastructure Recommendation

- **API Sync + Query + Auth extensión:** Cloudflare Workers (stack actual).
- **Event Store + Projections:** PostgreSQL managed (D1 insuficiente para ledger/portal a escala).
- **Accounts:** extender license-api.
- **BI interpret:** Worker actual (sin mover el cálculo Desktop).
- Costos: storage/IOPS de eventos, invocations, bandwidth, IA, email — escalan con empresas × eventos/día.

---

## 20. Migration Strategy

```
Instalaciones actuales sin Cloud → siguen igual
  → opt-in Cloud Foundation
  → Push
  → Pull
  → Portal read-only
  → Dual LAN+Cloud
  → Web writes
  → Multi-branch
  → Cloud Intelligence (mismas fórmulas)
```

Feature flags; bootstrap opcional; no regresión offline.

---

## 21. Implementation Phases (ajustadas)

### Phase 0 — QA Sync LAN + Architecture

- Checklist físico **2-PC PASS**.
- Verificar **idempotencia** y **no duplicación** de eventos.
- Congelar features Sync LAN no relacionadas a integridad.
- Arquitectura aprobada (este doc).

**Gate:** sin PASS de LAN 2-PC → **no** Cloud Sync productivo.

### Phase 1 — Cloud Foundation

- Auth (device + usuarios cloud).
- Companies, Devices.
- Event Store vacío/operativo.
- Applied Events.
- Esqueleto Sync/Query API (sin portal completo).

### Phase 2 — Cloud Push

- Desktop outbox → Cloud Event Store.
- Idempotencia server-side.
- Indicador pending/error.
- Desktop sigue autoridad operativa; Cloud solo ledger.

### Phase 3 — Cloud Pull

- Desktop recibe eventos de otros devices vía Cloud.
- Applied transversal (no reaplicar si ya vino por LAN cuando Dual exista).
- Projections iniciales rebuildables.

### Phase 4 — Owner Portal Read-Only

- `app.walqo.pro`
- Query API sobre Projections.
- **Cero escrituras** de negocio.
- Fórmulas alineadas a Desktop (§6b).

### Phase 5 — LAN + Cloud Dual Transport

- Un `event_id` → LAN y Cloud.
- Pruebas de no duplicación extremo a extremo.
- Política Drive vs Cloud documentada.

### Phase 6 — Web Writes

- Mutaciones acotadas (p.ej. ficha producto) con eventos y permisos.
- Desktop sigue crítico para POS/caja/periféricos.
- Aún **no** declarar Cloud como autoridad de catálogo salvo decisión explícita posterior.

### Phase 7 — Multi-Branch

- Sucursales / depósito; stock por branch.

### Phase 8 — Cloud Intelligence

- Alertas/métricas sobre projections cloud.
- **Mismas fórmulas** que Desktop.
- IA solo interpreta.

---

## 22. Risks

| Riesgo | Mitigación |
|--------|------------|
| Cloud Sync sin LAN PASS | Gate Phase 0 |
| Doble aplicación LAN+Cloud | Idempotencia transversal |
| Fórmulas divergentes Desktop/Cloud | Catálogo de fórmulas + tests de paridad |
| Scope creep POS web / Cloud authority temprana | Phases 4–6 + ownership §4 |
| Drive + Cloud overlap | Apagado planificado |
| Caja “unificada” falsa | Caja local por device + proyección cierres |

---

## 23. Open Questions

1. ¿Cloud Sync entra en qué plan comercial (Estándar vs Pro+)?
2. ¿Bootstrap inicial: snapshot desde activación o CDC-only forward?
3. ¿Hosting PostgreSQL concreto (Neon + Hyperdrive u otro)?
4. ¿Unlink de devices self-serve en Phase 1 o soporte manual?
5. ¿Portal Phase 4 muestra Intelligence como copy de proyección o embebe resumen ya calculado en Desktop syncado?
6. ¿En Phase 6, qué writes Web exactos entran primero (producto vs cliente vs ninguno de stock)?

---

## Qué reutilizar / falta / no tocar

| | |
|--|--|
| **Reutilizar** | Outbox/event_id/sync_id/deltas LAN, license devices, accounts, Workers, Intelligence local |
| **Falta** | Companies, Event Store cloud, Applied cloud, Projections, Sync/Query API, portal RO, dual transport, fórmulas compartidas |
| **Cambiar después** | Fan-out dual; void/sale ops; retiro gradual Drive |
| **No tocar ahora** | Código productivo, migraciones, Sync LAN (salvo QA/bugs), UI POS, autoridad de catálogo en Cloud |
