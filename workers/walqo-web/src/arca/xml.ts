/** Helpers XML livianos para SOAP WSAA/WSFE (sin DOM parser completo). */

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Primer texto de un tag local-name (ignora prefijo de namespace). */
export function findFirstText(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${localName}>`,
    "i",
  );
  const m = xml.match(re);
  if (!m) return null;
  const inner = m[1].trim();
  if (inner.includes("<") && !inner.startsWith("<![CDATA[")) {
    // A veces loginCmsReturn trae XML escapado.
    return unescapeXml(inner);
  }
  if (inner.startsWith("<![CDATA[") && inner.endsWith("]]>")) {
    return inner.slice(9, -3);
  }
  return unescapeXml(inner);
}

export function requireText(xml: string, localName: string): string {
  const v = findFirstText(xml, localName);
  if (v == null || v === "") throw new Error(`ARCA no devolvió ${localName}`);
  return v;
}

export function containsElement(xml: string, localName: string): boolean {
  return new RegExp(`<(?:[A-Za-z0-9_]+:)?${localName}\\b`, "i").test(xml);
}

export interface XmlMsg {
  code: string;
  msg: string;
}

export function collectMessages(xml: string, itemTag: string): XmlMsg[] {
  const out: XmlMsg[] = [];
  const re = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${itemTag}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${itemTag}>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const code = findFirstText(block, "Code") ?? "?";
    const msg = findFirstText(block, "Msg") ?? "";
    out.push({ code, msg });
  }
  return out;
}

export function soapFaultMessage(xml: string): string | null {
  if (!containsElement(xml, "Fault") && !/soap:Fault/i.test(xml)) return null;
  const code = findFirstText(xml, "faultcode") ?? findFirstText(xml, "faultCode") ?? "";
  const msg = findFirstText(xml, "faultstring") ?? findFirstText(xml, "faultString") ?? "Error SOAP";
  return code ? `${code}: ${msg}` : msg;
}
