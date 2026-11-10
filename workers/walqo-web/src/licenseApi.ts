/** Llamadas a workers/license-api (cuentas y licencias de WalQo). */

export interface WebAccountInfo {
  id: string;
  email: string;
  name: string;
  business_name: string | null;
  rubro: string | null;
}

export interface WebLicenseInfo {
  key: string;
  key_mask: string;
  plan: string;
  billing: string;
  /** Vencimiento en segundos (0 = no vence). */
  exp: number;
  revoked: boolean;
  max_devices: number;
  max_products: number | null;
  catalog_super: boolean;
}

export class LicenseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "LicenseApiError";
  }
}

export async function licenseFetch(
  env: Env,
  path: string,
  body: unknown,
  withSecret = false,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withSecret) headers["x-walqo-web-secret"] = env.WEB_SERVICE_SECRET ?? "";
  const init = { method: "POST", headers, body: JSON.stringify(body) };
  let res: Response;
  try {
    res = env.LICENSE
      ? await env.LICENSE.fetch(`https://license-api${path}`, init)
      : await fetch(`${env.LICENSE_API_URL.replace(/\/$/, "")}${path}`, init);
  } catch {
    throw new LicenseApiError("No se pudo conectar con el servidor de cuentas de WalQo.", 503, "network");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.ok === false) {
    throw new LicenseApiError(
      String(data.message ?? data.error ?? `El servidor de cuentas respondió ${res.status}.`),
      res.status,
      String(data.error ?? ""),
    );
  }
  return data;
}

/** Cuenta y licencia. Sin contraseña solo después de verificar el código del email. */
export async function fetchWebAccount(
  env: Env,
  input: { email: string; password?: string | null; licenseKey?: string | null },
): Promise<{ account: WebAccountInfo; license: WebLicenseInfo }> {
  const data = await licenseFetch(
    env,
    "/v1/web/account",
    { email: input.email, password: input.password ?? null, license_key: input.licenseKey ?? null },
    true,
  );
  return { account: data.account as WebAccountInfo, license: data.license as WebLicenseInfo };
}
