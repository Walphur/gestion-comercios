/**
 * En Workers la hora local es UTC. src/db arma «hoy», el mes y los rangos con los métodos
 * locales de Date, como en la PC del comercio: acá la hora local pasa a ser la de Argentina
 * (UTC−3, sin horario de verano). Se importa antes que cualquier otro módulo.
 */
const OFFSET_MS = 3 * 60 * 60 * 1000;
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const NativeDate = Date;
const proto = NativeDate.prototype;
const getTime = proto.getTime;

/** Fecha y hora sin zona: el navegador y la PC la leen como hora local. */
const LOCAL_STRING_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

function shifted(date: Date): Date {
  return new NativeDate(getTime.call(date) - OFFSET_MS);
}

const getters = {
  getFullYear: "getUTCFullYear",
  getMonth: "getUTCMonth",
  getDate: "getUTCDate",
  getDay: "getUTCDay",
  getHours: "getUTCHours",
  getMinutes: "getUTCMinutes",
  getSeconds: "getUTCSeconds",
  getMilliseconds: "getUTCMilliseconds",
} as const;

for (const [local, utc] of Object.entries(getters)) {
  Object.defineProperty(proto, local, {
    configurable: true,
    writable: true,
    value(this: Date) {
      return (shifted(this)[utc] as () => number)();
    },
  });
}

const setters = {
  setFullYear: "setUTCFullYear",
  setMonth: "setUTCMonth",
  setDate: "setUTCDate",
  setHours: "setUTCHours",
  setMinutes: "setUTCMinutes",
  setSeconds: "setUTCSeconds",
  setMilliseconds: "setUTCMilliseconds",
} as const;

for (const [local, utc] of Object.entries(setters)) {
  Object.defineProperty(proto, local, {
    configurable: true,
    writable: true,
    value(this: Date, ...args: number[]) {
      const s = shifted(this);
      (s[utc] as (...a: number[]) => number)(...args);
      return this.setTime(getTime.call(s) + OFFSET_MS);
    },
  });
}

Object.defineProperty(proto, "getTimezoneOffset", { configurable: true, writable: true, value: () => 180 });

for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"] as const) {
  const original = proto[name] as (locales?: string | string[], options?: Intl.DateTimeFormatOptions) => string;
  Object.defineProperty(proto, name, {
    configurable: true,
    writable: true,
    value(this: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return original.call(this, locales, { timeZone: TIME_ZONE, ...options });
    },
  });
}

function parseLocal(text: string): number {
  return NativeDate.parse(`${text.replace(" ", "T")}Z`) + OFFSET_MS;
}

const ArgentinaDate = function (this: unknown, ...args: unknown[]) {
  if (!new.target) return new NativeDate().toString();
  if (args.length >= 2) {
    return new NativeDate(NativeDate.UTC(...(args as [number, number])) + OFFSET_MS);
  }
  if (args.length === 1 && typeof args[0] === "string" && LOCAL_STRING_RE.test(args[0].trim())) {
    return new NativeDate(parseLocal(args[0].trim()));
  }
  return new (NativeDate as unknown as new (...a: unknown[]) => Date)(...args);
} as unknown as DateConstructor;

Object.assign(ArgentinaDate, {
  prototype: proto,
  now: NativeDate.now,
  UTC: NativeDate.UTC,
  parse: (text: string) => (LOCAL_STRING_RE.test(text.trim()) ? parseLocal(text.trim()) : NativeDate.parse(text)),
});

globalThis.Date = ArgentinaDate;
