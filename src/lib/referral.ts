import { invoke } from "@tauri-apps/api/core";

export interface ReferralInfo {
  code: string;
  /** Comercios que se registraron con el código. */
  invited: number;
  /** De esos, los que ya pagaron: un mes gratis por cada uno. */
  paying: number;
}

/** Código «Recomendá WalQo» del comercio (lo crea el servidor la primera vez). */
export function getReferral(): Promise<ReferralInfo> {
  return invoke<ReferralInfo>("license_referral");
}

export function referralMessage(code: string): string {
  return [
    "Uso WalQo para la caja, el stock y el fiado del negocio, y me anda bárbaro.",
    "Probalo gratis: https://walqo.pro",
    `Al crear la cuenta poné mi código ${code}.`,
  ].join("\n");
}
