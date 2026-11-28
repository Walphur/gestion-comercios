/**
 * Cifrado en reposo de certificado/clave/TA (AES-256-GCM).
 * En la web la clave sale de SESSION_SECRET (no del machine id de la PC).
 */
import { currentEnv } from "../context";

const te = new TextEncoder();
const td = new TextDecoder();

async function masterKey(): Promise<CryptoKey> {
  const secret = currentEnv().SESSION_SECRET?.trim();
  if (!secret) throw new Error("Falta SESSION_SECRET en el servidor de WalQo Web.");
  const digest = await crypto.subtle.digest("SHA-256", te.encode(`arca-secure-v1-web:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Cifra un texto (PEM/JSON) → base64(nonce(12) || ciphertext). */
export async function encryptSecret(plain: string): Promise<string> {
  const key = await masterKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, te.encode(plain));
  const blob = new Uint8Array(12 + cipher.byteLength);
  blob.set(nonce, 0);
  blob.set(new Uint8Array(cipher), 12);
  return b64encode(blob);
}

export async function decryptSecret(stored: string): Promise<string> {
  const blob = b64decode(stored);
  if (blob.length <= 12) throw new Error("Dato cifrado incompleto.");
  const nonce = blob.slice(0, 12);
  const ciphertext = blob.slice(12);
  const key = await masterKey();
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
    return td.decode(plain);
  } catch {
    throw new Error("No se pudo descifrar el certificado/clave. Volvé a cargarlos en Administración.");
  }
}
