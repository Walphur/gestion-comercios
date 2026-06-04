import { getDb } from "./index";

const STORAGE_KEY = "cash_session_id";

export async function getOpenCashSessionId(): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1",
  );
  return rows[0]?.id ?? null;
}

export async function isCashSessionOpen(sessionId: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ status: string }[]>(
    "SELECT status FROM cash_sessions WHERE id = $1",
    [sessionId],
  );
  return rows[0]?.status === "open";
}

/** Sincroniza localStorage con el turno abierto en la base (fuente de verdad). */
export async function syncCashSessionStorage(): Promise<number | null> {
  const openId = await getOpenCashSessionId();
  if (openId != null) {
    localStorage.setItem(STORAGE_KEY, String(openId));
    return openId;
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

export function getStoredCashSessionId(): number | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setStoredCashSessionId(id: number): void {
  localStorage.setItem(STORAGE_KEY, String(id));
}

export function clearStoredCashSessionId(): void {
  localStorage.removeItem(STORAGE_KEY);
}
