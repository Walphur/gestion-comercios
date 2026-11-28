/** Códigos CondicionIVAReceptor (RG 5615) y resolución de letra A/B/C. */

export type EmisorIva = "ri" | "monotributo" | "exento";

export const IVA_CONDITION = {
  RI: 1,
  EXENTO: 4,
  CF: 5,
  MONOTRIBUTO: 6,
} as const;

export const CBTE = {
  FACTURA_A: 1,
  ND_A: 2,
  NC_A: 3,
  FACTURA_B: 6,
  ND_B: 7,
  NC_B: 8,
  FACTURA_C: 11,
  ND_C: 12,
  NC_C: 13,
} as const;

export const IVA_CONDITION_OPTIONS: { value: number; label: string }[] = [
  { value: IVA_CONDITION.CF, label: "Consumidor final" },
  { value: IVA_CONDITION.RI, label: "IVA Responsable Inscripto" },
  { value: IVA_CONDITION.MONOTRIBUTO, label: "Monotributo" },
  { value: IVA_CONDITION.EXENTO, label: "Exento" },
];

export function emisorIvaLabel(v: EmisorIva): string {
  switch (v) {
    case "ri":
      return "Responsable Inscripto";
    case "exento":
      return "Exento";
    default:
      return "Monotributo";
  }
}

export function parseEmisorIva(raw: string | null | undefined): EmisorIva {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "ri" || v === "exento" || v === "monotributo") return v;
  return "monotributo";
}

export function documentDigits(doc: string | null | undefined): string {
  return (doc ?? "").replace(/\D/g, "");
}

/** 80 = CUIT, 96 = DNI, 99 = CF. */
export function resolveDocTipo(digits: string, ivaCondition: number | null | undefined): number {
  if (!digits) return 99;
  if (digits.length === 11) return 80;
  if (digits.length >= 7 && digits.length <= 8) return 96;
  if (ivaCondition === IVA_CONDITION.RI) return 80;
  return digits.length > 8 ? 80 : 96;
}

/**
 * Letra de factura según emisor + cliente.
 * Monotributo/exento → C. RI + cliente RI con CUIT → A. RI resto → B.
 */
export function resolveFacturaTipo(opts: {
  emisor: EmisorIva;
  customerIva: number | null | undefined;
  customerDoc: string | null | undefined;
}): number {
  if (opts.emisor !== "ri") return CBTE.FACTURA_C;
  const digits = documentDigits(opts.customerDoc);
  const iva = opts.customerIva ?? IVA_CONDITION.CF;
  if (iva === IVA_CONDITION.RI && digits.length === 11) return CBTE.FACTURA_A;
  return CBTE.FACTURA_B;
}

export function cbteLetter(cbteTipo: number): string {
  if ([1, 2, 3].includes(cbteTipo)) return "A";
  if ([6, 7, 8].includes(cbteTipo)) return "B";
  if ([11, 12, 13].includes(cbteTipo)) return "C";
  return "?";
}

export function cbteLabel(cbteTipo: number): string {
  switch (cbteTipo) {
    case 1:
      return "Factura A";
    case 2:
      return "Nota de débito A";
    case 3:
      return "Nota de crédito A";
    case 6:
      return "Factura B";
    case 7:
      return "Nota de débito B";
    case 8:
      return "Nota de crédito B";
    case 11:
      return "Factura C";
    case 12:
      return "Nota de débito C";
    case 13:
      return "Nota de crédito C";
    default:
      return `Comprobante ${cbteTipo}`;
  }
}

/** NC/ND del mismo libro que la factura original. */
export function adjustmentCbteTipo(originalCbte: number, kind: "credit" | "debit"): number {
  const letter = cbteLetter(originalCbte);
  if (kind === "credit") {
    if (letter === "A") return CBTE.NC_A;
    if (letter === "B") return CBTE.NC_B;
    return CBTE.NC_C;
  }
  if (letter === "A") return CBTE.ND_A;
  if (letter === "B") return CBTE.ND_B;
  return CBTE.ND_C;
}

export function canEmitFacturaA(opts: {
  emisor: EmisorIva;
  customerIva: number | null | undefined;
  customerDoc: string | null | undefined;
}): { ok: boolean; reason?: string } {
  if (opts.emisor !== "ri") {
    return { ok: false, reason: "La Factura A es para Responsable Inscripto." };
  }
  const digits = documentDigits(opts.customerDoc);
  if (digits.length !== 11) {
    return { ok: false, reason: "Para Factura A el cliente necesita CUIT (11 dígitos)." };
  }
  if ((opts.customerIva ?? IVA_CONDITION.CF) !== IVA_CONDITION.RI) {
    return {
      ok: false,
      reason: "Para Factura A el cliente debe ser IVA Responsable Inscripto.",
    };
  }
  return { ok: true };
}
