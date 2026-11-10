/**
 * JSON entre el navegador y workers/walqo-web que conserva Map, Set y Date,
 * porque varias funciones de src/db los devuelven o los reciben.
 */
const TAG = "__walqo";

type Tagged = { [TAG]: "Map" | "Set" | "Date"; v: unknown };

export function encodeWire(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key, current) {
    const raw = this[key];
    if (raw instanceof Date) return { [TAG]: "Date", v: raw.toISOString() };
    if (current instanceof Map) return { [TAG]: "Map", v: [...current.entries()] };
    if (current instanceof Set) return { [TAG]: "Set", v: [...current.values()] };
    return current;
  });
}

export function decodeWire<T>(text: string): T {
  return JSON.parse(text, (_key, current) => {
    if (current && typeof current === "object" && TAG in current) {
      const tagged = current as Tagged;
      if (tagged[TAG] === "Map") return new Map(tagged.v as [unknown, unknown][]);
      if (tagged[TAG] === "Set") return new Set(tagged.v as unknown[]);
      if (tagged[TAG] === "Date") return new Date(tagged.v as string);
    }
    return current;
  }) as T;
}
