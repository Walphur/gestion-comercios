//! Criptografía: firma del TRA como **CMS/PKCS#7 SignedData** usando RustCrypto.
//!
//! **Aislamiento intencional**: toda la criptografía vive en este archivo. Se
//! implementa en Rust puro (crates `cms`, `rsa`, `x509-cert`, `sha2`, `der`),
//! sin OpenSSL: no requiere Perl ni NASM y compila igual en Windows, Linux,
//! macOS y en CI. Si en el futuro se prefiere OpenSSL, solo se reemplaza este
//! módulo sin tocar el resto.
//!
//! ## Proceso criptográfico
//! Se construye un `SignedData` (RFC 5652) equivalente al que produce
//! `openssl cms -sign -nodetach`:
//!
//! 1. Se carga el certificado X.509 del emisor (PEM) y su clave privada RSA
//!    (PEM PKCS#8 o PKCS#1).
//! 2. Se define el contenido encapsulado (`eContent`) = bytes del TRA, con el
//!    tipo `id-data`. El contenido queda **embebido** (no detached) para que
//!    WSAA verifique firma y contenido en un solo blob.
//! 3. Se crea un `SignerInfo` identificado por *issuerAndSerialNumber*, con
//!    algoritmo de digest SHA-256. El builder agrega automáticamente los
//!    atributos firmados obligatorios: `content-type`, `message-digest`
//!    (SHA-256 del contenido) y `signing-time`.
//! 4. La firma se calcula con RSA PKCS#1 v1.5 sobre el DER de los atributos
//!    firmados.
//! 5. El `SignedData` se serializa en DER y se codifica en Base64. Ese Base64
//!    es el contenido del elemento `<in0>` del sobre `loginCms`.

use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use cms::builder::{SignedDataBuilder, SignerInfoBuilder};
use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::ContentInfo;
use cms::signed_data::{EncapsulatedContentInfo, SignedData, SignerIdentifier};
use const_oid::db::{rfc5911::ID_DATA, rfc5912::ID_SHA_256};
use const_oid::ObjectIdentifier;
use der::{Any, Decode, Encode, Tag};
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs1v15::{Signature as RsaSignature, SigningKey, VerifyingKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::signature::Verifier;
use rsa::traits::PublicKeyParts;
use rsa::{RsaPrivateKey, RsaPublicKey};
use sha2::{Digest, Sha256};
use spki::AlgorithmIdentifierOwned;
use x509_cert::der::DecodePem;
use x509_cert::Certificate;

use crate::arca::errors::{ArcaError, ArcaResult};

/// Longitud mínima de clave RSA aceptada (bits). ARCA emite claves de 2048.
const MIN_RSA_KEY_BITS: usize = 2048;

/// Datos legibles de un certificado X.509, para diagnóstico en la UI.
///
/// Ninguno de estos campos es sensible: son metadatos públicos del certificado
/// (nunca incluye la clave privada).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CertificateReport {
    /// Sujeto (DN) del certificado, p. ej. `CN=..., O=..., serialNumber=CUIT ...`.
    pub subject: String,
    /// Emisor (la CA de ARCA en producción; el nombre propio en homologación).
    pub issuer: String,
    /// Número de serie en hexadecimal.
    pub serial: String,
    /// OID del algoritmo de firma del certificado.
    pub signature_algorithm: String,
    /// Longitud de la clave pública RSA en bits.
    pub key_bits: usize,
    /// Inicio de validez (ISO 8601, UTC).
    pub not_before: String,
    /// Fin de validez (ISO 8601, UTC).
    pub not_after: String,
    /// Días restantes hasta el vencimiento (negativo si ya venció).
    pub days_to_expiry: i64,
}

/// OID del atributo firmado `message-digest` (PKCS#9 1.2.840.113549.1.9.4).
const OID_MESSAGE_DIGEST: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.4");

/// Normaliza PEM copiado desde WSASS u otros orígenes (BOM, CRLF, texto extra, espacios).
pub fn normalize_pem(pem: &str, is_private_key: bool) -> ArcaResult<String> {
    let mut s = pem.replace('\r', "");
    if let Some(stripped) = s.strip_prefix('\u{FEFF}') {
        s = stripped.to_string();
    }

    let (begin, end) = if is_private_key {
        if s.contains("-----BEGIN RSA PRIVATE KEY-----") {
            (
                "-----BEGIN RSA PRIVATE KEY-----",
                "-----END RSA PRIVATE KEY-----",
            )
        } else {
            ("-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----")
        }
    } else {
        ("-----BEGIN CERTIFICATE-----", "-----END CERTIFICATE-----")
    };

    let start = s.find(begin).ok_or_else(|| pem_normalize_err(is_private_key, begin))?;
    let rest = &s[start..];
    let end_rel = rest
        .find(end)
        .ok_or_else(|| pem_normalize_err(is_private_key, end))?;
    let block = &rest[..end_rel + end.len()];

    let body_start = block.find('\n').map(|i| i + 1).unwrap_or(begin.len());
    let body_end = block.rfind(end).unwrap_or(block.len());
    let body_raw = &block[body_start..body_end];

    let body: String = body_raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '+' || *c == '/' || *c == '=')
        .collect();

    if body.len() < 64 {
        return Err(pem_normalize_err(
            is_private_key,
            "contenido Base64 demasiado corto o vacío",
        ));
    }

    let mut wrapped = String::new();
    for chunk in body.as_bytes().chunks(64) {
        wrapped.push_str(std::str::from_utf8(chunk).map_err(|e| {
            pem_normalize_err(is_private_key, &format!("Base64 inválido: {e}"))
        })?);
        wrapped.push('\n');
    }

    Ok(format!("{begin}\n{wrapped}{end}\n"))
}

fn pem_normalize_err(is_private_key: bool, detail: &str) -> ArcaError {
    if is_private_key {
        ArcaError::InvalidPrivateKey(format!(
            "PEM inválido ({detail}). Asegurate de copiar desde -----BEGIN ... KEY----- hasta -----END ... KEY-----."
        ))
    } else {
        ArcaError::InvalidCertificate(format!(
            "PEM inválido ({detail}). Copiá solo el bloque desde -----BEGIN CERTIFICATE----- hasta -----END CERTIFICATE-----."
        ))
    }
}

/// Carga la clave privada RSA desde PEM (acepta PKCS#8 y PKCS#1).
fn load_private_key(key_pem: &str) -> ArcaResult<RsaPrivateKey> {
    let normalized = normalize_pem(key_pem, true)?;
    RsaPrivateKey::from_pkcs8_pem(&normalized)
        .or_else(|_| RsaPrivateKey::from_pkcs1_pem(&normalized))
        .map_err(|e| ArcaError::InvalidPrivateKey(e.to_string()))
}

/// Verifica que la clave privada RSA en PEM cargue correctamente.
///
/// Paso de diagnóstico independiente (sin tocar el certificado).
pub fn check_private_key(key_pem: &str) -> ArcaResult<()> {
    load_private_key(key_pem).map(|_| ())
}

/// Carga el certificado X.509 desde PEM.
fn load_certificate(cert_pem: &str) -> ArcaResult<Certificate> {
    let normalized = normalize_pem(cert_pem, false)?;
    Certificate::from_pem(normalized.as_bytes())
        .map_err(|e| ArcaError::InvalidCertificate(e.to_string()))
}

/// Identificador SHA-256 sin parámetros, para el digest del CMS.
fn sha256_alg() -> AlgorithmIdentifierOwned {
    AlgorithmIdentifierOwned {
        oid: ID_SHA_256,
        parameters: None,
    }
}

/// Firma el TRA y devuelve el CMS/PKCS#7 en DER codificado en Base64.
///
/// - `tra_xml`: bytes del XML del TRA (contenido a firmar y embeber).
/// - `cert_pem`: certificado X.509 del emisor en PEM.
/// - `key_pem`: clave privada RSA del emisor en PEM.
///
/// # Errores
/// - [`ArcaError::InvalidCertificate`] si el certificado no carga.
/// - [`ArcaError::InvalidPrivateKey`] si la clave no carga.
/// - [`ArcaError::InvalidSignature`] si la firma o la serialización fallan.
pub fn sign_tra_cms(tra_xml: &[u8], cert_pem: &str, key_pem: &str) -> ArcaResult<String> {
    let cert = load_certificate(cert_pem)?;
    // Copia del certificado para la verificación final (el builder consume una).
    let cert_for_verify = cert.clone();
    let private_key = load_private_key(key_pem)?;

    // Clave de firma RSA PKCS#1 v1.5 con digest SHA-256.
    let signing_key = SigningKey::<Sha256>::new(private_key);

    // Contenido encapsulado (embebido): eContentType = id-data, eContent = TRA.
    let econtent_value = Any::new(Tag::OctetString, tra_xml)
        .map_err(|e| ArcaError::InvalidSignature(format!("no se pudo envolver el TRA: {e}")))?;
    let encapsulated = EncapsulatedContentInfo {
        econtent_type: ID_DATA,
        econtent: Some(econtent_value),
    };

    // Identificación del firmante por emisor + número de serie del certificado.
    let signer_id = SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber {
        issuer: cert.tbs_certificate.issuer.clone(),
        serial_number: cert.tbs_certificate.serial_number.clone(),
    });

    let digest_alg = sha256_alg();

    // Builder del SignerInfo: agrega content-type, message-digest y signing-time
    // como atributos firmados y calcula la firma al construir el SignedData.
    let signer_info = SignerInfoBuilder::new(
        &signing_key,
        signer_id,
        digest_alg.clone(),
        &encapsulated,
        None,
    )
    .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?;

    // Ensamblado del SignedData: digest algorithms + certificado + signer info.
    let content_info: ContentInfo = SignedDataBuilder::new(&encapsulated)
        .add_digest_algorithm(digest_alg)
        .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?
        .add_certificate(CertificateChoices::Certificate(cert))
        .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?
        .add_signer_info::<SigningKey<Sha256>, rsa::pkcs1v15::Signature>(signer_info)
        .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?
        .build()
        .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?;

    let der = content_info
        .to_der()
        .map_err(|e| ArcaError::InvalidSignature(e.to_string()))?;

    // Verificación de conformidad con WSAA: antes de devolver el CMS, se
    // reproduce exactamente lo que hará el verificador de ARCA (recomputar el
    // message-digest y validar la firma RSA sobre los atributos firmados). Si
    // algo no encaja, se falla acá con un diagnóstico claro en lugar de que el
    // cliente lo descubra al emitir su primera factura.
    verify_cms_conformance(&der, tra_xml, &cert_for_verify)?;

    Ok(base64::engine::general_purpose::STANDARD.encode(der))
}

/// Verifica que el CMS generado sea aceptable para WSAA.
///
/// Reproduce las dos comprobaciones que hace el verificador de ARCA:
/// 1. El atributo firmado `message-digest` debe ser exactamente `SHA-256` del
///    contenido (el TRA).
/// 2. La firma RSA PKCS#1 v1.5 debe validar sobre el DER del conjunto de
///    atributos firmados (`SET OF`), usando la clave pública del certificado
///    embebido.
///
/// Es una post-condición barata (microsegundos) que garantiza que la firma es
/// criptográficamente válida y con el formato correcto.
fn verify_cms_conformance(der: &[u8], content: &[u8], cert: &Certificate) -> ArcaResult<()> {
    let content_info = ContentInfo::from_der(der)
        .map_err(|e| ArcaError::InvalidSignature(format!("CMS ilegible: {e}")))?;
    let signed_data: SignedData = content_info
        .content
        .decode_as()
        .map_err(|e| ArcaError::InvalidSignature(format!("SignedData ilegible: {e}")))?;

    let signer = signed_data
        .signer_infos
        .0
        .iter()
        .next()
        .ok_or_else(|| ArcaError::InvalidSignature("el CMS no tiene SignerInfo".to_string()))?;

    let signed_attrs = signer.signed_attrs.as_ref().ok_or_else(|| {
        ArcaError::InvalidSignature("el CMS no tiene atributos firmados".to_string())
    })?;

    // (1) message-digest == SHA-256(contenido).
    let expected_digest = Sha256::digest(content);
    let md_attr = signed_attrs
        .iter()
        .find(|a| a.oid == OID_MESSAGE_DIGEST)
        .ok_or_else(|| ArcaError::InvalidSignature("falta el message-digest".to_string()))?;
    let md_value = md_attr
        .values
        .get(0)
        .ok_or_else(|| ArcaError::InvalidSignature("message-digest vacío".to_string()))?;
    if md_value.value() != expected_digest.as_slice() {
        return Err(ArcaError::InvalidSignature(
            "el message-digest del CMS no coincide con el contenido firmado (incompatible con WSAA)"
                .to_string(),
        ));
    }

    // (2) Firma RSA válida sobre el SET OF de atributos firmados.
    let attrs_der = signed_attrs.to_der().map_err(|e| {
        ArcaError::InvalidSignature(format!("no se pudo re-serializar atributos: {e}"))
    })?;

    let spki_der = cert
        .tbs_certificate
        .subject_public_key_info
        .to_der()
        .map_err(|e| ArcaError::InvalidCertificate(e.to_string()))?;
    let public_key = RsaPublicKey::from_public_key_der(&spki_der)
        .map_err(|e| ArcaError::InvalidCertificate(format!("clave pública no RSA: {e}")))?;

    let verifying_key = VerifyingKey::<Sha256>::new(public_key);
    let signature = RsaSignature::try_from(signer.signature.as_bytes())
        .map_err(|e| ArcaError::InvalidSignature(format!("firma ilegible: {e}")))?;

    verifying_key.verify(&attrs_der, &signature).map_err(|_| {
        ArcaError::InvalidSignature(
            "la firma CMS no valida contra el certificado (incompatible con WSAA)".to_string(),
        )
    })?;

    Ok(())
}

/// Valida que el certificado y la clave privada carguen y sean coherentes.
///
/// Útil para "Probar conexión": detecta PEM corruptos o una clave que no
/// corresponde al certificado, comparando las claves públicas RSA.
pub fn validate_keypair(cert_pem: &str, key_pem: &str) -> ArcaResult<()> {
    let cert = load_certificate(cert_pem)?;
    let private_key = load_private_key(key_pem)?;

    // Clave pública del certificado (desde su SubjectPublicKeyInfo en DER).
    let spki_der = cert
        .tbs_certificate
        .subject_public_key_info
        .to_der()
        .map_err(|e| ArcaError::InvalidCertificate(e.to_string()))?;
    let cert_pub = RsaPublicKey::from_public_key_der(&spki_der)
        .map_err(|e| ArcaError::InvalidCertificate(format!("clave pública no RSA: {e}")))?;

    if cert_pub != private_key.to_public_key() {
        return Err(ArcaError::InvalidPrivateKey(
            "la clave privada no corresponde al certificado".to_string(),
        ));
    }
    Ok(())
}

/// Inspecciona y valida un certificado X.509 en PEM.
///
/// Devuelve un [`CertificateReport`] con los metadatos públicos y, además,
/// **rechaza** con un error claro los certificados no aptos para producción:
/// - todavía no vigente (`notBefore` en el futuro),
/// - vencido (`notAfter` en el pasado),
/// - clave RSA menor a [`MIN_RSA_KEY_BITS`] bits.
///
/// El Key Usage / Extended Key Usage se reporta de forma informativa; ARCA no
/// rechaza por esos campos, así que no se usan como criterio de fallo (evita
/// falsos negativos que bloquearían certificados legítimos).
pub fn inspect_certificate(cert_pem: &str) -> ArcaResult<CertificateReport> {
    let cert = load_certificate(cert_pem)?;
    let tbs = &cert.tbs_certificate;

    // Clave pública y longitud.
    let spki_der = tbs
        .subject_public_key_info
        .to_der()
        .map_err(|e| ArcaError::InvalidCertificate(e.to_string()))?;
    let public_key = RsaPublicKey::from_public_key_der(&spki_der).map_err(|e| {
        ArcaError::InvalidCertificate(format!("la clave pública del certificado no es RSA: {e}"))
    })?;
    let key_bits = public_key.size() * 8;

    // Ventana de validez (segundos desde epoch).
    let not_before_secs = tbs.validity.not_before.to_unix_duration().as_secs() as i64;
    let not_after_secs = tbs.validity.not_after.to_unix_duration().as_secs() as i64;
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let report = CertificateReport {
        subject: tbs.subject.to_string(),
        issuer: tbs.issuer.to_string(),
        serial: hex::encode_upper(tbs.serial_number.as_bytes()),
        signature_algorithm: cert.signature_algorithm.oid.to_string(),
        key_bits,
        not_before: format_epoch(not_before_secs),
        not_after: format_epoch(not_after_secs),
        days_to_expiry: (not_after_secs - now_secs) / 86_400,
    };

    if now_secs < not_before_secs {
        return Err(ArcaError::InvalidCertificate(format!(
            "el certificado todavía no es válido (rige desde {})",
            report.not_before
        )));
    }
    if now_secs > not_after_secs {
        return Err(ArcaError::InvalidCertificate(format!(
            "el certificado venció el {}. Renovalo en ARCA.",
            report.not_after
        )));
    }
    if key_bits < MIN_RSA_KEY_BITS {
        return Err(ArcaError::InvalidCertificate(format!(
            "la clave del certificado es demasiado corta ({key_bits} bits); se requieren al menos {MIN_RSA_KEY_BITS}"
        )));
    }

    Ok(report)
}

/// Formatea segundos-desde-epoch a ISO 8601 UTC para mostrar al usuario.
fn format_epoch(secs: i64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
        .unwrap_or_else(|| format!("epoch:{secs}"))
}
