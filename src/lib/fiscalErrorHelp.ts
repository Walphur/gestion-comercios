export interface FiscalErrorInfo {
  code: string | null;
  title: string;
  summary: string;
  hint: string;
  detail: string;
}

const KNOWN_CODES: Record<string, { title: string; summary: string; hint: string }> = {
  "10246": {
    title: "Falta condición de IVA del cliente",
    summary: "ARCA exige indicar la condición frente al IVA del comprador en cada factura.",
    hint: "Actualizá la app a la última versión. Si sigue fallando, contactá soporte con el código 10246.",
  },
  "10016": {
    title: "Comprobante duplicado",
    summary: "ARCA detectó que ese número de factura ya fue usado.",
    hint: "Revisá en Administración el último comprobante autorizado. Si el error persiste, avisá a soporte.",
  },
  "10048": {
    title: "Punto de venta no habilitado",
    summary: "El punto de venta configurado no está habilitado en ARCA para ese tipo de factura.",
    hint: "Verificá en Administración → ARCA que el punto de venta y el tipo de comprobante coincidan con los dados de alta en AFIP.",
  },
  "10013": {
    title: "Comprobante ya autorizado",
    summary: "Esa factura ya tiene CAE en ARCA.",
    hint: "Buscá la factura en «Facturas emitidas». Si no aparece, contactá soporte.",
  },
  "600": {
    title: "Validación de datos",
    summary: "Algún dato del comprobante no cumple las reglas de ARCA.",
    hint: "Revisá el detalle abajo. Corregí la venta o la configuración y usá «Reintentar fallidas».",
  },
};

function stripPrefixes(raw: string): string {
  return raw
    .replace(/^respuesta de ARCA inválida o incompleta:\s*/i, "")
    .replace(/^ARCA rechazó el comprobante:\s*/i, "")
    .trim();
}

export function parseFiscalError(raw: string): FiscalErrorInfo {
  const detail = stripPrefixes(raw);
  const codeMatch = detail.match(/\[(\d+)\]/);
  const code = codeMatch?.[1] ?? null;

  if (code && KNOWN_CODES[code]) {
    const known = KNOWN_CODES[code];
    return { code, title: known.title, summary: known.summary, hint: known.hint, detail };
  }

  const lower = raw.toLowerCase();

  if (lower.includes("no está configurado") || lower.includes("certificado")) {
    return {
      code,
      title: "Falta configurar ARCA",
      summary: "La facturación electrónica no está lista en este equipo.",
      hint: "Un administrador debe completar CUIT, punto de venta y certificado en Administración → ARCA.",
      detail,
    };
  }

  if (lower.includes("no se pudo contactar") || lower.includes("red") || lower.includes("timeout")) {
    return {
      code,
      title: "Sin conexión con ARCA",
      summary: "No se pudo enviar la factura por un problema de internet o del servidor de ARCA.",
      hint: "Verificá la conexión a internet y reintentá en unos minutos con «Reintentar fallidas».",
      detail,
    };
  }

  if (lower.includes("autenticación") || lower.includes("ticket de acceso") || lower.includes("token")) {
    return {
      code,
      title: "Problema de acceso a ARCA",
      summary: "El certificado o la sesión con ARCA no es válida.",
      hint: "Revisá el certificado en Administración → ARCA. Si venció, generá uno nuevo en AFIP.",
      detail,
    };
  }

  if (lower.includes("clave privada") || lower.includes("certificado x.509")) {
    return {
      code,
      title: "Certificado inválido",
      summary: "El certificado o la clave privada no se pudieron leer.",
      hint: "Volvé a cargar el certificado (.crt) y la clave (.key) en Administración → ARCA.",
      detail,
    };
  }

  return {
    code,
    title: code ? `Error ARCA ${code}` : "No se pudo emitir la factura",
    summary: "ARCA rechazó o no pudo procesar el comprobante.",
    hint: "Copiá el reporte de abajo y enviáselo a soporte o a quien administre ARCA en tu comercio.",
    detail: detail || raw,
  };
}

export function buildFiscalErrorReport(opts: {
  saleId: number;
  raw: string;
  appVersion?: string;
}): string {
  const info = parseFiscalError(opts.raw);
  const lines = [
    "--- Error de facturación ---",
    `Venta: #${opts.saleId}`,
    info.code ? `Código ARCA: ${info.code}` : null,
    `Problema: ${info.title}`,
    `Qué significa: ${info.summary}`,
    `Qué hacer: ${info.hint}`,
    "",
    "Detalle técnico:",
    info.detail,
    opts.appVersion ? `\nApp: Gestión Comercios ${opts.appVersion}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
