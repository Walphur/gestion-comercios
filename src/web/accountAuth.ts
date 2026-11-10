/**
 * src/lib/accountAuth.ts en WalQo Web (lo cambia scripts/web/vite-db-rpc.mjs): la cuenta pasa
 * por workers/walqo-web, que al entrar o verificar el código devuelve la sesión del comercio.
 */
import type { AuthLoginResult, AuthRegisterResult, AuthVerifyResult } from "../lib/accountAuth";
import { setWebToken, webCall } from "./api";

export type { AuthLoginResult, AuthRegisterResult, AuthVerifyResult } from "../lib/accountAuth";
export { checkSellerCode } from "../lib/accountAuth";

type SessionResult = AuthLoginResult & { token?: string };

function keepSession<T extends SessionResult>(res: T): T {
  if (res.token) setWebToken(res.token);
  const { token: _token, ...rest } = res;
  return rest as T;
}

export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
  business_name: string;
  rubro: string;
  phone?: string;
  heard_from?: string;
  previous_tool?: string;
  goal?: string;
  team_size?: string;
  seller_code?: string;
}): Promise<AuthRegisterResult> {
  return webCall("/v1/session/register", input);
}

export async function verifyAccountCode(email: string, code: string): Promise<AuthVerifyResult> {
  const res = await webCall<SessionResult>("/v1/session/verify", { email, code });
  return { ...keepSession(res), verified: true };
}

export async function resendAccountCode(email: string): Promise<AuthRegisterResult> {
  return webCall("/v1/session/resend", { email });
}

export async function loginAccount(input: { email: string; password: string }): Promise<AuthLoginResult> {
  return keepSession(await webCall<SessionResult>("/v1/session/login", input));
}

export async function forgotAccountPassword(email: string): Promise<AuthRegisterResult> {
  return webCall("/v1/session/forgot", { email });
}

export async function resetAccountPassword(input: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  return webCall("/v1/session/reset", input);
}
