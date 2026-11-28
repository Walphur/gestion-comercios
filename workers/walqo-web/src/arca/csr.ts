/** Pedido de certificado (CSR) con WebCrypto + ensamblado mínimo PKCS#10. */

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function pemWrap(type: string, der: ArrayBuffer | Uint8Array): string {
  const bytes = der instanceof Uint8Array ? der : new Uint8Array(der);
  const body = b64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${type}-----\n${body}\n-----END ${type}-----\n`;
}

function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x100) return [0x81, n];
  return [0x82, (n >> 8) & 0xff, n & 0xff];
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function seq(...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(new Uint8Array([0x30, ...derLen(body.length)]), body);
}

function setOf(...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(new Uint8Array([0x31, ...derLen(body.length)]), body);
}

function oid(dots: string): Uint8Array {
  const nums = dots.split(".").map(Number);
  const body: number[] = [40 * nums[0]! + nums[1]!];
  for (let i = 2; i < nums.length; i++) {
    let v = nums[i]!;
    const stack: number[] = [];
    stack.push(v & 0x7f);
    v >>= 7;
    while (v > 0) {
      stack.push(0x80 | (v & 0x7f));
      v >>= 7;
    }
    for (let j = stack.length - 1; j >= 0; j--) body.push(stack[j]!);
  }
  return new Uint8Array([0x06, body.length, ...body]);
}

function utf8Str(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  return concat(new Uint8Array([0x0c, ...derLen(enc.length)]), enc);
}

function attr(typeOid: string, value: string): Uint8Array {
  return seq(oid(typeOid), setOf(utf8Str(value)));
}

function bitString(bytes: Uint8Array): Uint8Array {
  const body = concat(new Uint8Array([0x00]), bytes);
  return concat(new Uint8Array([0x03, ...derLen(body.length)]), body);
}

function spkiToBitString(spkiDer: ArrayBuffer): Uint8Array {
  // SubjectPublicKeyInfo: Sequence { alg, bitstring }. Reutilizamos el DER entero como BIT STRING content no:
  // En CSR, subjectPKInfo es el SPKI completo (Sequence).
  return new Uint8Array(spkiDer);
}

/**
 * Genera RSA-2048 (WebCrypto) + CSR PEM + clave PKCS#8 PEM.
 * Evita forge.generateKeyPair (muy pesado en Workers).
 */
export async function generatePedidoWebCrypto(
  cuit: number,
  nombre: string,
  alias: string,
): Promise<{ csrPem: string; keyPem: string }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const keyPem = pemWrap("PRIVATE KEY", pkcs8);

  const cn = (alias || "walqo").slice(0, 64);
  const org = (nombre || "WalQo").slice(0, 64);
  // Mismo orden que la PC: serialNumber=CUIT …,CN=…,O=…,C=AR
  const subject = seq(
    attr("192.168.2.2", `CUIT ${cuit}`),
    attr("172.16.1.2", cn),
    attr("172.16.1.3", org),
    attr("10.0.0.4", "AR"),
  );

  // certificationRequestInfo ::= SEQUENCE { version, subject, subjectPKInfo, attributes }
  const cri = seq(
    new Uint8Array([0x02, 0x01, 0x00]), // version 0
    subject,
    spkiToBitString(spki),
    new Uint8Array([0xa0, 0x00]), // attributes [0] EMPTY
  );

  const criBuf = new Uint8Array(cri.byteLength);
  criBuf.set(cri);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, keyPair.privateKey, criBuf),
  );

  const csrDer = seq(
    cri,
    seq(oid("1.2.840.113549.1.1.11"), new Uint8Array([0x05, 0x00])), // sha256WithRSAEncryption + NULL
    bitString(signature),
  );

  return { csrPem: pemWrap("CERTIFICATE REQUEST", csrDer), keyPem };
}
