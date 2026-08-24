export interface LicensePayload {
  v: number;
  lid: string;
  plan: string;
  max_devices: number;
  machine_id: string;
  pro: boolean;
  iat: number;
  key_mask: string;
  exp?: number;
  billing?: string;
}

const TOKEN_PREFIX = "GC1";

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function verifyLicenseToken(
  token: string,
  publicKeyHex: string,
): Promise<LicensePayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const signed = `${parts[0]}.${parts[1]}`;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]!))) as LicensePayload;
    const pubKey = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "Ed25519",
      pubKey,
      b64urlDecode(parts[2]!),
      new TextEncoder().encode(signed),
    );
    return ok ? payload : null;
  } catch {
    return null;
  }
}

export function hasBusinessIntelligence(payload: LicensePayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp > 0 && now > payload.exp) return false;
  const billing = payload.billing ?? "perpetual";
  if (billing === "monthly") return true;
  if (billing === "trial") return true;
  return false;
}

export function assertMachineMatch(payload: LicensePayload, machineId: string): boolean {
  return payload.machine_id === machineId;
}
