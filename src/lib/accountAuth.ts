import { getMachineId } from "./license";

const LICENSE_API_URL =
  (import.meta as { env?: { VITE_LICENSE_API_URL?: string } }).env?.VITE_LICENSE_API_URL ||
  "https://gestion-comercios-license.walphur.workers.dev";

export interface AuthRegisterResult {
  ok: boolean;
  needs_verification?: boolean;
  already_verified?: boolean;
  email_sent?: boolean;
  license_key?: string;
  message?: string;
  dev_code?: string;
  email_error?: string;
  error?: string;
}

export interface AuthVerifyResult {
  ok: boolean;
  verified?: boolean;
  email?: string;
  name?: string;
  business_name?: string;
  rubro?: string;
  license_key?: string;
  message?: string;
  error?: string;
}

export interface AuthLoginResult {
  ok: boolean;
  email?: string;
  name?: string;
  business_name?: string;
  rubro?: string;
  license_key?: string;
  message?: string;
  error?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${LICENSE_API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.message || data.error || `Error ${res.status}`);
  }
  return data;
}

export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
  business_name: string;
  rubro: string;
  phone?: string;
}): Promise<AuthRegisterResult> {
  const machine_id = await getMachineId();
  return postJson("/v1/auth/register", { ...input, machine_id });
}

export async function verifyAccountCode(email: string, code: string): Promise<AuthVerifyResult> {
  const machine_id = await getMachineId();
  return postJson("/v1/auth/verify", { email, code, machine_id });
}

export async function resendAccountCode(email: string): Promise<AuthRegisterResult> {
  return postJson("/v1/auth/resend", { email });
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<AuthLoginResult> {
  const machine_id = await getMachineId();
  return postJson("/v1/auth/login", { ...input, machine_id });
}

export async function forgotAccountPassword(email: string): Promise<AuthRegisterResult> {
  return postJson("/v1/auth/forgot", { email });
}

export async function resetAccountPassword(input: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  return postJson("/v1/auth/reset", input);
}
