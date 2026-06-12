# Checklist antes de vender — Gestión Comercios

> Guía práctica, no es asesoramiento legal. Para temas fiscales o contratos, consultá a un contador o abogado.

## Lo mínimo recomendado (sí o sí)

| Ítem | Estado | Dónde |
|------|--------|--------|
| **WhatsApp / soporte** | ✅ En la app | +54 9 266 503-1950 — Admin → Sistema → Soporte y legal |
| **Política de privacidad** | ✅ Texto listo | `docs/legal/privacidad.html` — publicar en GitHub Pages |
| **Términos de uso** | ✅ Texto listo | `docs/legal/terminos.html` |
| **Enlaces en la app** | ✅ | Sidebar + activación de licencia + Admin |
| **Aclarar qué NO incluye** | En ML | Sin AFIP completo, sin Win 7, licencia 1 PC (Básico) |

### Publicar privacidad y términos en la web

Los links de la app apuntan a:

- https://walphur.github.io/gestion-comercios/legal/soporte.html
- https://walphur.github.io/gestion-comercios/legal/privacidad.html
- https://walphur.github.io/gestion-comercios/legal/terminos.html

Si ya tenés GitHub Pages con la carpeta `/docs` del repo (como el OAuth de Mercado Pago), los archivos en `docs/legal/` se publican solos al hacer push. URLs:

**En Mercado Libre:** pegá esas dos URLs al final de la descripción o en “Más información del vendedor”.

---

## Tu lado como vendedor (Argentina)

### Facturación de tus ventas

- Si vendés por Mercado Libre, **tenés que facturar** tus ingresos según tu situación (monotributo, RI, etc.).
- Mercado Libre puede pedirte datos fiscales en la cuenta de vendedor.
- El software **no factura por vos** las ventas que vos hacés del programa; eso lo hacés vos con tu contador / AFIP.

### Datos del comprador

- Guardá en una planilla: fecha, pedido ML, clave `GC-…`, plan, si hubo reclamo.
- No necesitás pedir DNI para activar la licencia hoy; la clave + PC alcanza.

### Política de devoluciones (ML)

Definí y escribí en la publicación algo como:

```
Producto digital: entrega de instalador + clave.
Devolución según política de Mercado Libre si la licencia no fue activada
o dentro de los 7 días si hay fallo de instalación no resuelto por soporte.
```

### Garantía

Para software suele alcanzar:

```
Soporte de instalación y activación por WhatsApp.
Actualizaciones incluidas mientras el producto esté en venta.
```

---

## Qué datos maneja la app (para explicar al cliente)

| Dato | ¿Sale de la PC? |
|------|------------------|
| Productos, ventas, clientes, caja | **No** (queda local) |
| Clave de licencia + ID de PC | **Sí**, solo para activar/validar |
| Actualizaciones | Consulta GitHub |
| Mercado Pago QR | **Opcional**, directo con MP del comercio |
| Sync multi-PC (Pro) | **Opcional**, carpeta Drive del usuario |

Esto ya está en la política de privacidad.

---

## Mercado Libre — textos para copiar

Al final de la descripción:

```
Política de privacidad: https://walphur.github.io/gestion-comercios/legal/privacidad.html
Términos de uso: https://walphur.github.io/gestion-comercios/legal/terminos.html
Soporte: WhatsApp +54 9 266 503-1950
```

---

## Opcional pero recomendable

- [ ] Nombre comercial / monotributo o RI al día para facturar ventas
- [ ] Cuenta de Mercado Libre con reputación y respuestas rápidas
- [ ] Video corto de instalación (2 min) para bajar reclamos
- [x] Precio del catálogo +200k: **$10.000** (aparte)
- [ ] Revisar con contador si conviene factura A/B/C según compradores

---

## Lo que NO hace falta (para tu tipo de producto)

- Registro en Play Store (es app de escritorio Windows)
- Certificación AFIP del software (todavía no facturás ARCA real desde la app)
- GDPR europeo (vendés en Argentina; la política igual ayuda si algún día vendés afuera)

---

## Si te preguntan por “Ley de protección de datos”

En Argentina aplica la Ley 25.326. Con este producto el punto sensible es:

1. **Datos del comercio** → los tiene el comercio en su PC (ellos son responsables de sus clientes).
2. **Vos** → solo licencia, soporte y lo que te escriban por WhatsApp.

Tener la política publicada y el link en ML suele ser suficiente para arrancar como software chico.
