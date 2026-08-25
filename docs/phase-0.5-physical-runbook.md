# Phase 0.5a — Runbook físico bootstrap catálogo LAN

**Estado:** Listo para prueba manual (no PASS declarado)  
**Rama:** `cursor/phase-0.5-bootstrap`

## Pre-requisitos

- PC A = **Servidor** (34.000 productos aprox.)
- PC B = **Cliente** (50 productos únicos, distintos sync_id)
- Misma PSK en ambas PCs
- Sync LAN habilitado y conectado
- Versión con Phase 0.5a instalada

## Escenario objetivo

| Paso | PC A | PC B |
|------|------|------|
| Inicio | 34.000 | 50 |
| Post-bootstrap | 34.050 | 34.050 |

## Procedimiento

### 1. Servidor (PC A)

1. Admin → Sync LAN → modo **Servidor**
2. Iniciar servidor
3. **1. Exportar catálogo (servidor)**
4. Verificar UI: Bootstrap `34000/34000` (aprox.), Outbox 0

### 2. Cliente (PC B)

1. Conectar al servidor
2. **Bootstrap completo (cliente)** — import + contribución en un paso
3. Verificar: ~34.050 productos (34k importados + 50 locales ya presentes)
4. El hub (A) aplica la contribución al recibir el push HTTP — **no** requiere "Descargar del servidor"

### 3. Finalizar

1. A queda en bootstrap `complete` automáticamente al recibir la contribución
2. B queda en bootstrap `complete` al terminar el flujo cliente
3. Verificar conteos: A=34.050, B=34.050

### 4. Post-bootstrap CDC

| Acción | Esperado |
|--------|----------|
| A crea producto X | B recibe X |
| B crea producto Y | A recibe Y |
| A modifica precio X | B recibe modificación |
| B modifica precio Y | A recibe modificación |

### 5. Resume @40%

1. Durante import en B, desconectar WiFi ~40%
2. Cerrar app
3. Reconectar, reabrir, **Importar catálogo** de nuevo
4. Debe continuar desde cursor — sin duplicados (AlreadyApplied)

## Contadores UI (separados)

- **Bootstrap:** progreso import/export
- **Outbox:** cola saliente CDC
- **Deferred:** lan_sync_pending_apply
- **Conflicts:** lan_sync_conflicts abiertos

## No incluido en bootstrap

- Stock absoluto
- Ventas históricas
- Variants (solo advertencia en UI)

## Benchmark separado

```bash
cd src-tauri
cargo test benchmark_bootstrap_34k_plus_50 -- --ignored --nocapture
```
