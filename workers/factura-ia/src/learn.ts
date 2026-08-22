/** Memoria compartida de Factura IA — correcciones al descargar CSV / confirmar ingreso. */

export interface LearnedItem {
  codigo: string;
  nombre: string;
  costo: number;
  precio: number;
  hits: number;
  updated_at: string;
}

export interface LearnPayloadItem {
  codigo?: string;
  nombre?: string;
  costo?: number;
  precio?: number;
  stock?: number;
  cantidad?: number;
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function normCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function normNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

function codeKey(code: string): string {
  return `code:${normCode(code)}`;
}

function nameKey(name: string): string {
  return `name:${normNameKey(name)}`;
}

async function readLearned(kv: KVNamespace, key: string): Promise<LearnedItem | null> {
  try {
    const raw = await kv.get(key, "json");
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const nombre = String(o.nombre ?? "").trim();
    if (!nombre) return null;
    return {
      codigo: String(o.codigo ?? "").trim(),
      nombre,
      costo: round2(Number(o.costo ?? 0)),
      precio: round2(Number(o.precio ?? 0)),
      hits: Math.max(1, Math.round(Number(o.hits ?? 1))),
      updated_at: String(o.updated_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

async function upsertLearned(kv: KVNamespace, key: string, next: LearnedItem): Promise<void> {
  const prev = await readLearned(kv, key);
  const merged: LearnedItem = {
    codigo: next.codigo || prev?.codigo || "",
    nombre: next.nombre || prev?.nombre || "",
    costo: next.costo > 0 ? next.costo : (prev?.costo ?? 0),
    precio: next.precio > 0 ? next.precio : (prev?.precio ?? 0),
    hits: (prev?.hits ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  if (!merged.nombre) return;
  await kv.put(key, JSON.stringify(merged));
}

/** Guarda ítems corregidos (al descargar CSV o confirmar ingreso). */
export async function saveLearning(
  kv: KVNamespace,
  items: LearnPayloadItem[],
): Promise<{ saved: number }> {
  let saved = 0;
  for (const raw of items) {
    const nombre = String(raw.nombre ?? "").trim();
    const codigo = String(raw.codigo ?? "").trim();
    const costo = round2(Number(raw.costo ?? 0));
    const precio = round2(Number(raw.precio ?? 0));
    if (nombre.length < 2) continue;
    if (costo < 0 && precio < 0) continue;

    const entry: LearnedItem = {
      codigo,
      nombre,
      costo: Math.max(0, costo),
      precio: Math.max(0, precio),
      hits: 1,
      updated_at: new Date().toISOString(),
    };

    if (codigo && codigo.length >= 3) {
      await upsertLearned(kv, codeKey(codigo), entry);
      saved++;
    }
    if (nombre.length >= 4) {
      await upsertLearned(kv, nameKey(nombre), entry);
      saved++;
    }
  }
  return { saved };
}

export interface EnrichableItem {
  nombre: string;
  codigo?: string;
  costo: number;
  precio?: number;
  [key: string]: unknown;
}

/**
 * Aplica memoria a ítems recién leídos:
 * - Si hay código conocido → completa/corrige nombre y costo
 * - Si costo=0 y hay nombre conocido → completa costo
 */
export async function enrichWithLearning<T extends EnrichableItem>(
  kv: KVNamespace,
  items: T[],
): Promise<{ items: T[]; applied: number }> {
  let applied = 0;
  const out: T[] = [];

  for (const it of items) {
    let next = { ...it };
    let hit: LearnedItem | null = null;

    if (it.codigo && it.codigo.trim().length >= 3) {
      hit = await readLearned(kv, codeKey(it.codigo));
    }
    if (!hit && it.nombre) {
      hit = await readLearned(kv, nameKey(it.nombre));
    }

    if (hit) {
      const patch: Partial<EnrichableItem> = {};
      if (hit.nombre && (!it.nombre || it.nombre.length < hit.nombre.length * 0.6)) {
        patch.nombre = hit.nombre;
      } else if (hit.nombre && hit.hits >= 2 && normNameKey(hit.nombre) !== normNameKey(it.nombre)) {
        // Si se corrigió varias veces, preferir el nombre aprendido cuando el OCR es muy distinto
        if (it.nombre.length < 8 || hit.hits >= 3) patch.nombre = hit.nombre;
      }
      if (hit.costo > 0 && (!(it.costo > 0) || Math.abs(it.costo - hit.costo) / hit.costo > 0.35)) {
        // Completar costo 0, o reemplazar si el OCR está muy lejos del aprendido
        if (!(it.costo > 0) || hit.hits >= 2) patch.costo = hit.costo;
      }
      if (hit.precio > 0 && (!(Number(it.precio) > 0))) {
        patch.precio = hit.precio;
      }
      if (hit.codigo && !it.codigo) {
        patch.codigo = hit.codigo;
      }
      if (Object.keys(patch).length > 0) {
        next = { ...next, ...patch };
        applied++;
      }
    }
    out.push(next);
  }

  return { items: out, applied };
}
