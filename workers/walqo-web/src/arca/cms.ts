/**
 * Firma CMS/PKCS#7 SignedData attached (TRA embebido) para WSAA.
 * node-forge con SHA-256; NO detached (AFIP rechaza cms.sign.invalid).
 */
import forge from "node-forge";

export function normalizePem(pem: string, isPrivateKey: boolean): string {
  let s = pem.replace(/\r/g, "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);

  let begin: string;
  let end: string;
  if (isPrivateKey) {
    if (s.includes("-----BEGIN RSA PRIVATE KEY-----")) {
      begin = "-----BEGIN RSA PRIVATE KEY-----";
      end = "-----END RSA PRIVATE KEY-----";
    } else {
      begin = "-----BEGIN PRIVATE KEY-----";
      end = "-----END PRIVATE KEY-----";
    }
  } else {
    begin = "-----BEGIN CERTIFICATE-----";
    end = "-----END CERTIFICATE-----";
  }

  const start = s.indexOf(begin);
  if (start < 0) {
    throw new Error(
      isPrivateKey
        ? "PEM de clave inválido. Debe incluir -----BEGIN ... KEY-----."
        : "PEM de certificado inválido. Debe incluir -----BEGIN CERTIFICATE-----.",
    );
  }
  const rest = s.slice(start);
  const endRel = rest.indexOf(end);
  if (endRel < 0) throw new Error("PEM incompleto (falta el END).");
  const block = rest.slice(0, endRel + end.length);
  const nl = block.indexOf("\n");
  const bodyRaw = nl >= 0 ? block.slice(nl + 1, block.lastIndexOf(end)) : "";
  const body = bodyRaw.replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 64) throw new Error("PEM vacío o demasiado corto.");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${begin}\n${wrapped}\n${end}\n`;
}

/** Firma el TRA XML y devuelve CMS en Base64 para loginCms. */
export function signTraCms(traXml: string, certPem: string, keyPem: string): string {
  const certNorm = normalizePem(certPem, false);
  const keyNorm = normalizePem(keyPem, true);
  const cert = forge.pki.certificateFromPem(certNorm);
  const key = forge.pki.privateKeyFromPem(keyNorm);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  } as Parameters<typeof p7.addSigner>[0]);
  // Sin { detached: true }: WSAA exige contenido embebido.
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

export function validateKeypair(certPem: string, keyPem: string): void {
  const cert = forge.pki.certificateFromPem(normalizePem(certPem, false));
  const key = forge.pki.privateKeyFromPem(normalizePem(keyPem, true));
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  const priv = key as forge.pki.rsa.PrivateKey;
  const msg = forge.util.createBuffer("walqo-arca-check");
  const md = forge.md.sha256.create();
  md.update(msg.getBytes());
  const sig = priv.sign(md);
  const md2 = forge.md.sha256.create();
  md2.update(msg.getBytes());
  if (!pub.verify(md2.digest().bytes(), sig)) {
    throw new Error("El certificado y la clave privada no forman un par válido.");
  }
}

export interface CertInfo {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  daysToExpiry: number;
  keyBits: number;
}

export function inspectCertificate(certPem: string): CertInfo {
  const cert = forge.pki.certificateFromPem(normalizePem(certPem, false));
  const notAfter = cert.validity.notAfter;
  const days = Math.floor((notAfter.getTime() - Date.now()) / 86_400_000);
  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  return {
    subject: cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    issuer: cert.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    daysToExpiry: days,
    keyBits: pub.n.bitLength(),
  };
}
