# Configurar emails de verificación (Resend + Cloudflare Worker)

Los códigos OTP salen por **Resend**. Si no está configurado, la app muestra el código en pantalla (modo dev).

## 1. Resend

1. Creá cuenta en https://resend.com
2. **API Keys** → Create API Key → copiá `re_...`
3. Para mails a **cualquier cliente**, verificá un dominio en **Domains** (ej. `waltech.com.ar`) con DNS SPF/DKIM
4. Sin dominio verificado solo podés mandar a **el email de tu cuenta Resend** usando `onboarding@resend.dev`

## 2. Secrets en Cloudflare

```powershell
cd "F:\Juan Archivos\Apps de gestion\Kiosco y comercios\workers\license-api"

npx wrangler secret put RESEND_API_KEY
# pegá la key re_...

# Opcional, cuando tengas dominio verificado:
npx wrangler secret put EMAIL_FROM
# ejemplo: WalQo <hola@tudominio.com>

npx wrangler deploy
```

## 3. Producción

Cuando Resend funcione, podés apagar el fallback en pantalla editando `wrangler.toml`:

```toml
ALLOW_DEV_OTP = "0"
```

y volver a desplegar.

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
