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

use base64::Engine as _;
use cms::builder::{SignedDataBuilder, SignerInfoBuilder};
use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::ContentInfo;
use cms::signed_data::{EncapsulatedContentInfo, SignerIdentifier};
use const_oid::db::{rfc5911::ID_DATA, rfc5912::ID_SHA_256};
use der::{Any, Encode, Tag};
use rsa::pkcs1::DecodeRsaPrivateKey;
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::{RsaPrivateKey, RsaPublicKey};
use sha2::Sha256;
use spki::AlgorithmIdentifierOwned;
use x509_cert::der::DecodePem;
use x509_cert::Certificate;

use crate::arca::errors::{ArcaError, ArcaResult};

/// Carga la clave privada RSA desde PEM (acepta PKCS#8 y PKCS#1).
fn load_private_key(key_pem: &str) -> ArcaResult<RsaPrivateKey> {
    RsaPrivateKey::from_pkcs8_pem(key_pem)
        .or_else(|_| RsaPrivateKey::from_pkcs1_pem(key_pem))
        .map_err(|e| ArcaError::InvalidPrivateKey(e.to_string()))
}

/// Carga el certificado X.509 desde PEM.
fn load_certificate(cert_pem: &str) -> ArcaResult<Certificate> {
    Certificate::from_pem(cert_pem.as_bytes())
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

    Ok(base64::engine::general_purpose::STANDARD.encode(der))
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
