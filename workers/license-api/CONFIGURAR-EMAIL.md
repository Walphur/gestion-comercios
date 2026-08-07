# Configurar emails de verificación (Resend + Cloudflare Worker)

Los códigos OTP salen por **Resend**. Si no está configurado, la app muestra el código en pantalla (modo dev).

## 1. Resend

1. Creá cuenta en https://resend.com
2. **API Keys** → Create API Key → copiá `re_...`
3. Para mails a **cualquier cliente**, verificá un dominio en **Domains** con DNS SPF/DKIM
4. Sin dominio verificado solo podés mandar a **el email de tu cuenta Resend** usando `onboarding@resend.dev`

---

## Dominio `walqo.pro` (producción WalQo)

### Paso A — Agregar dominio en Resend

1. Entrá a https://resend.com/domains → **Add domain**
2. Dominio: `walqo.pro` (raíz; Resend usa el subdominio `send` para SPF/MX)
3. Copiá los registros que te muestra el panel (son únicos por cuenta; **no uses valores de otro dominio**)

Si el DNS está en **Cloudflare**, podés usar **Sign in to Cloudflare** en Resend para que los cargue solos.

### Paso B — Registros DNS en Cloudflare (manual)

En **Cloudflare → walqo.pro → DNS → Records**. En el campo **Name** pegá solo la parte izquierda (sin `.walqo.pro`).

| Tipo | Name (Cloudflare) | Contenido / destino | Prioridad | Proxy |
|------|-------------------|---------------------|-----------|-------|
| **MX** | `send` | `feedback-smtp.us-east-1.amazonses.com` *(o el que muestre Resend)* | `10` | DNS only |
| **TXT** | `send` | `v=spf1 include:amazonses.com ~all` *(copiar exacto de Resend)* | — | DNS only |
| **CNAME** | `{token1}._domainkey` | `{token1}.dkim.amazonses.com` *(3 registros DKIM; nombres aleatorios de Resend)* | — | DNS only |
| **CNAME** | `{token2}._domainkey` | `{token2}.dkim.amazonses.com` | — | DNS only |
| **CNAME** | `{token3}._domainkey` | `{token3}.dkim.amazonses.com` | — | DNS only |

**Importante:** Resend puede mostrar `TXT` en `resend._domainkey` en lugar de CNAME en cuentas nuevas. Usá **siempre** lo que dice tu panel, carácter por carácter.

**DMARC (recomendado, no lo agrega Resend):**

| Tipo | Name | Contenido |
|------|------|-----------|
| **TXT** | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hola@walqo.pro` |

Empezá con `p=none`; cuando veas que los mails llegan bien, podés subir a `quarantine` o `reject`.

**Verificar propagación:**

```powershell
nslookup -type=TXT send.walqo.pro
nslookup -type=MX send.walqo.pro
nslookup -type=TXT resend._domainkey.walqo.pro
```

En Resend → **Verify DNS records**. Suele tardar minutos (máx. ~72 h).

### Paso C — Secrets y deploy del Worker

```powershell
cd "F:\Juan Archivos\Apps de gestion\Kiosco y comercios\workers\license-api"

npx wrangler secret put RESEND_API_KEY
# pegá la key re_...

npx wrangler secret put EMAIL_FROM
# WalQo <hola@walqo.pro>

# Opcional: logo en emails (PNG/JPG público HTTPS)
# npx wrangler secret put EMAIL_LOGO_URL
# https://walqo.pro/branding/walqo-mark.png

npx wrangler deploy
```

El remitente por defecto en código es `WalQo <onboarding@resend.dev>` si falta `EMAIL_FROM`:

```169:169:workers/license-api/src/auth.ts
  const from = env.EMAIL_FROM?.trim() || "WalQo <onboarding@resend.dev>";
```

### Paso D — Apagar OTP en pantalla (producción)

Cuando `email_sent: true` en las pruebas, editá `wrangler.toml`:

```toml
ALLOW_DEV_OTP = "0"
```

y volvé a desplegar.

---

## 2. Secrets en Cloudflare (resumen)

```powershell
cd "F:\Juan Archivos\Apps de gestion\Kiosco y comercios\workers\license-api"

npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM   # WalQo <hola@walqo.pro>
npx wrangler deploy
```

---

## 3. Landing `walqo.pro` (GitHub Pages + carpeta `/docs`)

El repo **Walphur/gestion-comercios** publica la landing desde la carpeta **`/docs`** (sin workflow de Pages; GitHub lo sirve al hacer push a `main`).

Hoy la URL es https://walphur.github.io/gestion-comercios/ (`docs/index.html`, legal, OAuth callback, herramientas).

### GitHub

1. Repo → **Settings → Pages**
2. **Build and deployment → Source:** Deploy from a branch
3. **Branch:** `main` → folder **`/docs`** → Save
4. **Custom domain:** `walqo.pro` → Save (GitHub crea/actualiza `docs/CNAME` con `walqo.pro`)

Si usás solo subdominio `www.walqo.pro`, el CNAME apunta a `walphur.github.io` y el custom domain en GitHub es `www.walqo.pro`.

### DNS en Cloudflare (landing)

**Opción recomendada — apex `walqo.pro` apunta a GitHub Pages:**

| Tipo | Name | Contenido | Proxy |
|------|------|-----------|-------|
| **A** | `@` | `185.199.108.153` | DNS only |
| **A** | `@` | `185.199.109.153` | DNS only |
| **A** | `@` | `185.199.110.153` | DNS only |
| **A** | `@` | `185.199.111.153` | DNS only |
| **AAAA** | `@` | `2606:50c0:8000::153` | DNS only |
| **AAAA** | `@` | `2606:50c0:8001::153` | DNS only |
| **AAAA** | `@` | `2606:50c0:8002::153` | DNS only |
| **AAAA** | `@` | `2606:50c0:8003::153` | DNS only |
| **CNAME** | `www` | `walphur.github.io` | DNS only |

En Cloudflare podés usar **CNAME flattening** en `@` → `walphur.github.io` en lugar de las 4 A (más simple).

**SSL:** Cloudflare → SSL/TLS → **Full** (no “Flexible”) para evitar bucles con GitHub.

**Enforce HTTPS:** activado en GitHub Pages después de que el dominio verifique.

### Después de que `walqo.pro` funcione (opcional)

Actualizar URLs en el código si querés dejar de usar `walphur.github.io`:

- `src/config/support.ts` — `DOWNLOAD_PAGE_URL`, `LEGAL_BASE_URL`, etc.
- OAuth Mercado Pago — redirect en MP Developers y en `release.yml` / `mp_oauth.json` (requiere republicar instalador)

Hasta entonces, **ambas URLs** (`walqo.pro` y `walphur.github.io/gestion-comercios/`) pueden convivir.

---

## 4. ¿Dónde compraste el dominio?

| Escenario | Qué hacer |
|-----------|-----------|
| **Comprado en Cloudflare Registrar** | DNS ya está en Cloudflare; agregá los registros de Resend + GitHub arriba. |
| **Comprado en Namecheap, GoDaddy, NIC, etc.** | Recomendado: **Add site** en Cloudflare (plan Free), cambiá nameservers en el registrador a los que te da Cloudflare, y administrá todo el DNS ahí. |
| **Solo email, landing en github.io** | Verificá `walqo.pro` en Resend; no hace falta apuntar el apex a GitHub. |
| **Email + landing en walqo.pro** | Registros de Resend en `send.*` + registros A/CNAME de GitHub en `@` / `www`. No chocan entre sí. |

---

## Probar

```powershell
$body = @{
  email = "tu@email.com"
  name = "Test"
  password = "password123"
  business_name = "Mi negocio"
  rubro = "general"
  machine_id = "test-machine-id-12345678"
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://gestion-comercios-license.walphur.workers.dev/v1/auth/register" `
  -Method POST -ContentType "application/json" -Body $body
```

Si `email_sent: true`, el mail salió. Si `email_sent: false`, falta la API key o el remitente no está autorizado.
