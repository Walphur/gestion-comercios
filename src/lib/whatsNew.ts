import { CHANGELOG, type ChangeContext, type ReleaseNote } from "../config/changelog";

/** -1, 0 o 1, comparando "1.2.10" con "1.2.9" número por número. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Notas para el rubro, sin las que no aplican y sin versiones vacías. */
export function notesFor(ctx: ChangeContext, notes: ReleaseNote[] = CHANGELOG): ReleaseNote[] {
  return notes
    .map((n) => ({ ...n, items: n.items.filter((i) => !i.when || i.when(ctx)) }))
    .filter((n) => n.items.length > 0);
}

/** Lo que salió después de `seen` y hasta la versión instalada. */
export function notesSince(
  seen: string,
  current: string,
  ctx: ChangeContext,
  notes: ReleaseNote[] = CHANGELOG,
): ReleaseNote[] {
  return notesFor(ctx, notes).filter(
    (n) => compareVersions(n.version, seen) > 0 && compareVersions(n.version, current) <= 0,
  );
}
