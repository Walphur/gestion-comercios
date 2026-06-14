# Plan mensual — Gestión Comercios

## Precios actuales (ARS)

| Plan | Mensual lanzamiento | Objetivo (producto completo) |
|------|---------------------|------------------------------|
| Básico (1 PC) | **$25.000** | $50.000 |
| Pro (2–3 PCs) | **$35.000** | consultar |

Incluye: programa + **catálogo super ~200k** + actualizaciones + centro de ayuda + soporte WhatsApp.

---

## Crear licencia mensual (vos)

Doble clic: **`crear-licencia-mensual.bat`**

O por consola:

```bash
node scripts/license-admin.mjs create --plan basic --monthly --months 1 --note "Juan kiosco"
```

## Renovar cuando pagan el mes

Doble clic: **`renovar-licencia.bat`** → pegás la clave `GC-…` → suma 30 días.

```bash
node scripts/license-admin.mjs extend --key GC-XXXX-XXXX-XXXX --months 1
```

## Desplegar cambios del servidor (una vez)

```bash
cd workers/license-api
npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v2.sql
npm run deploy
```

Sin la migración D1, las licencias mensuales no guardan fecha de vencimiento.

---

## Qué ve el cliente en la app

- Admin → Plan: tipo de plan, fecha de vencimiento
- Aviso amarillo si faltan ≤7 días para vencer
- Botones: Soporte, Ayuda (centro de ayuda web), Privacidad, Términos
- Soporte WhatsApp manda versión + ID de PC automático

---

## Centro de ayuda (videos)

Página: https://walphur.github.io/gestion-comercios/legal/ayuda.html

Subí videos a YouTube y enlazalos en `docs/legal/ayuda.html` cuando los tengas.

---

## Próximas mejoras sugeridas

1. Videos en ayuda.html (YouTube)
2. ~~Resumen del día por WhatsApp~~ ✅ Reportes → Resumen hoy
3. ~~Export ventas para contador~~ ✅ Reportes → CSV contador / Detalle CSV
4. Backup en la nube opcional
5. AFIP/ARCA real → subir a $50k/mes
