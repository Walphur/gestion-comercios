//! Pruebas del módulo ARCA.
//!
//! - **Unitarias** (siempre corren): tiempo/formato, XML, modelos, configuración
//!   y criptografía (con un par RSA + certificado autofirmado generado en memoria).
//! - **Integración** (marcadas `#[ignore]`): golpean Homologación de ARCA usando
//!   credenciales reales tomadas de variables de entorno. No corren en CI ni en
//!   `cargo test` normal; se ejecutan a demanda con
//!   `cargo test -- --ignored` y las variables `ARCA_*` seteadas.

use super::config::{ArcaConfig, ArcaEnvironment};
use super::models::AccessTicket;
use super::utils::{format_iso8601, now_ar, parse_iso8601, truncate_for_log, unique_id};
use super::xml::{build_tra_xml, find_first_text, parse_soap_fault, require_text};

// ── Helpers: par RSA + certificado autofirmado en memoria ───────────────────

/// Genera un par (certificado PEM, clave privada PEM) autofirmado de 2048 bits.
fn generate_pem_pair() -> (String, String) {
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};
    use rsa::RsaPrivateKey;

    let mut rng = rand::rngs::OsRng;
    let private_key = RsaPrivateKey::new(&mut rng, 2048).expect("generar clave RSA de prueba");
    let key_pem = private_key
        .to_pkcs8_pem(LineEnding::LF)
        .expect("PEM PKCS#8")
        .to_string();
    let cert_pem = self_signed_cert(&private_key);
    (cert_pem, key_pem)
}

/// Construye un certificado X.509 autofirmado a partir de una clave RSA.
fn self_signed_cert(private_key: &rsa::RsaPrivateKey) -> String {
    use rsa::pkcs1v15::SigningKey;
    use rsa::pkcs8::EncodePublicKey;
    use sha2::Sha256;
    use std::str::FromStr;
    use std::time::Duration;
    use x509_cert::builder::{Builder, CertificateBuilder, Profile};
    use x509_cert::der::EncodePem;
    use x509_cert::name::Name;
    use x509_cert::serial_number::SerialNumber;
    use x509_cert::spki::SubjectPublicKeyInfoOwned;
    use x509_cert::time::Validity;

    let pub_der = private_key
        .to_public_key()
        .to_public_key_der()
        .expect("clave pública DER");
    let spki = SubjectPublicKeyInfoOwned::try_from(pub_der.as_bytes()).expect("SPKI");
    let signer = SigningKey::<Sha256>::new(private_key.clone());
    let serial = SerialNumber::new(&[0x01]).expect("serial");
    let validity = Validity::from_now(Duration::from_secs(365 * 24 * 3600)).expect("validez");
    let subject = Name::from_str("CN=Test ARCA,O=WalTech,C=AR").expect("subject");
    let builder = CertificateBuilder::new(Profile::Root, serial, validity, subject, spki, &signer)
        .expect("builder");
    let cert = builder
        .build::<rsa::pkcs1v15::Signature>()
        .expect("firmar certificado");
    cert.to_pem(x509_cert::der::pem::LineEnding::LF)
        .expect("certificado PEM")
}

/// Par compartido entre tests (la generación de RSA es cara; se hace una vez).
fn shared_pair() -> &'static (String, String) {
    static PAIR: std::sync::OnceLock<(String, String)> = std::sync::OnceLock::new();
    PAIR.get_or_init(generate_pem_pair)
}

// ── utils ───────────────────────────────────────────────────────────────────

#[test]
fn iso8601_roundtrip_conserva_instante() {
    let now = now_ar().unwrap();
    let text = format_iso8601(&now);
    let parsed = parse_iso8601(&text).unwrap();
    assert_eq!(now.timestamp(), parsed.timestamp());
}

#[test]
fn format_iso8601_usa_offset_argentina() {
    let now = now_ar().unwrap();
    let text = format_iso8601(&now);
    assert!(
        text.ends_with("-03:00"),
        "esperaba offset -03:00, fue {text}"
    );
    assert!(text.contains('T'));
}

#[test]
fn unique_id_es_positivo() {
    assert!(unique_id().unwrap() > 0);
}

#[test]
fn truncate_for_log_respeta_limite_y_unicode() {
    assert_eq!(truncate_for_log("hola", 10), "hola");
    let long = "a".repeat(1000);
    let cut = truncate_for_log(&long, 100);
    assert!(cut.chars().count() <= 101); // 100 + elipsis
                                         // No debe panicar cortando en medio de un carácter multibyte.
    let uni = "ñ".repeat(50);
    let _ = truncate_for_log(&uni, 5);
}

// ── models ──────────────────────────────────────────────────────────────────

#[test]
fn access_ticket_valid_respeta_margen() {
    let now = now_ar().unwrap();
    let ticket = AccessTicket {
        token: "t".into(),
        sign: "s".into(),
        generation_time: now,
        expiration_time: now + chrono::Duration::seconds(600),
    };
    // Vence en 10 min: válido con margen de 5 min.
    assert!(ticket.is_valid(now, 300));
    // Con margen de 11 min ya no debería considerarse válido.
    assert!(!ticket.is_valid(now, 11 * 60));
}

// ── config ──────────────────────────────────────────────────────────────────

#[test]
fn config_valida_ok() {
    let (cert, key) = shared_pair();
    let cfg = ArcaConfig::new(
        20_304_050_607,
        1,
        cert.clone(),
        key.clone(),
        ArcaEnvironment::Homologacion,
    );
    assert!(cfg.is_ok());
}

#[test]
fn config_rechaza_cuit_invalido() {
    let (cert, key) = shared_pair();
    let cfg = ArcaConfig::new(
        123,
        1,
        cert.clone(),
        key.clone(),
        ArcaEnvironment::Homologacion,
    );
    assert!(cfg.is_err());
}

#[test]
fn config_rechaza_pem_invalido() {
    let cfg = ArcaConfig::new(
        20_304_050_607,
        1,
        "no soy un certificado",
        "tampoco una clave",
        ArcaEnvironment::Homologacion,
    );
    assert!(cfg.is_err());
}

// ── xml ─────────────────────────────────────────────────────────────────────

#[test]
fn build_tra_xml_incluye_campos_obligatorios() {
    use super::models::Tra;
    let now = now_ar().unwrap();
    let tra = Tra {
        unique_id: 12345,
        generation_time: now,
        expiration_time: now + chrono::Duration::hours(2),
        service: "wsfe".to_string(),
    };
    let xml = build_tra_xml(&tra).unwrap();
    assert!(xml.contains("<loginTicketRequest version=\"1.0\">"));
    assert!(xml.contains("<uniqueId>12345</uniqueId>"));
    assert!(xml.contains("<service>wsfe</service>"));
    assert!(xml.contains("<generationTime>"));
    assert!(xml.contains("<expirationTime>"));
}

#[test]
fn find_first_text_ignora_prefijo_de_namespace() {
    let xml = br#"<a:root xmlns:a="urn:x"><a:token>ABC123</a:token></a:root>"#;
    assert_eq!(
        find_first_text(xml, "token").unwrap().as_deref(),
        Some("ABC123")
    );
}

#[test]
fn require_text_falla_si_no_existe() {
    let xml = b"<root/>";
    assert!(require_text(xml, "token").is_err());
}

#[test]
fn parse_soap_fault_detecta_fault_11() {
    let xml = br#"<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><soap:Fault>
            <faultcode>soap:Server</faultcode>
            <faultstring>Certificado expirado</faultstring>
        </soap:Fault></soap:Body></soap:Envelope>"#;
    let fault = parse_soap_fault(xml).unwrap();
    assert!(fault.is_some());
    let (code, msg) = fault.unwrap();
    assert!(code.contains("Server"));
    assert_eq!(msg, "Certificado expirado");
}

#[test]
fn parse_soap_fault_sin_fault_devuelve_none() {
    let xml = br#"<Envelope><Body><loginCmsReturn>ok</loginCmsReturn></Body></Envelope>"#;
    assert!(parse_soap_fault(xml).unwrap().is_none());
}

// ── crypto ──────────────────────────────────────────────────────────────────

#[test]
fn inspect_certificate_reporta_2048_bits_y_vigencia() {
    let (cert, _key) = shared_pair();
    let rep = super::crypto::inspect_certificate(cert).unwrap();
    assert_eq!(rep.key_bits, 2048);
    assert!(
        rep.days_to_expiry > 360,
        "vence en {} días",
        rep.days_to_expiry
    );
    assert!(!rep.serial.is_empty());
    assert!(rep.subject.contains("Test ARCA"));
}

#[test]
fn normalize_pem_limpia_texto_extra_de_wsass() {
    let (cert, _key) = shared_pair();
    let messy = format!(
        "Resultado del WSASS:\r\n\r\n{cert}\r\nFin del certificado."
    );
    let clean = super::crypto::normalize_pem(&messy, false).unwrap();
    assert!(super::crypto::inspect_certificate(&clean).is_ok());
}

#[test]
fn validate_keypair_acepta_par_correcto() {
    let (cert, key) = shared_pair();
    assert!(super::crypto::validate_keypair(cert, key).is_ok());
}

#[test]
fn validate_keypair_rechaza_clave_ajena() {
    let (cert, _key) = shared_pair();
    let (_cert2, otra_key) = generate_pem_pair();
    assert!(super::crypto::validate_keypair(cert, &otra_key).is_err());
}

#[test]
fn sign_tra_cms_genera_cms_valido_y_verificable() {
    let (cert, key) = shared_pair();
    let tra = b"<loginTicketRequest version=\"1.0\"/>";
    let cms_b64 = super::crypto::sign_tra_cms(tra, cert, key).expect("firma CMS");

    // El resultado debe ser Base64 decodificable a un ContentInfo (SignedData).
    use base64::Engine as _;
    let der = base64::engine::general_purpose::STANDARD
        .decode(&cms_b64)
        .expect("base64 válido");
    use cms::content_info::ContentInfo;
    use der::Decode;
    let ci = ContentInfo::from_der(&der).expect("ContentInfo");
    assert_eq!(ci.content_type, const_oid::db::rfc5911::ID_SIGNED_DATA);
    // La verificación de conformidad ya corre dentro de sign_tra_cms; si el CMS
    // no fuera válido para WSAA, la llamada anterior habría fallado.
}

// ── Integración (Homologación) — requieren credenciales reales ──────────────

/// Lee la configuración de Homologación desde variables de entorno.
///
/// Devuelve `None` (y el test se salta) si no están todas presentes.
fn homolog_config_from_env() -> Option<ArcaConfig> {
    let cuit: u64 = std::env::var("ARCA_CUIT").ok()?.trim().parse().ok()?;
    let pv: u32 = std::env::var("ARCA_PV").ok()?.trim().parse().ok()?;
    let cert = std::fs::read_to_string(std::env::var("ARCA_CERT_PATH").ok()?).ok()?;
    let key = std::fs::read_to_string(std::env::var("ARCA_KEY_PATH").ok()?).ok()?;
    ArcaConfig::new(cuit, pv, cert, key, ArcaEnvironment::Homologacion).ok()
}

#[tokio::test]
#[ignore = "requiere credenciales de Homologación en ARCA_CUIT/ARCA_PV/ARCA_CERT_PATH/ARCA_KEY_PATH"]
async fn integracion_fedummy_responde() {
    let Some(config) = homolog_config_from_env() else {
        eprintln!("saltado: faltan variables ARCA_*");
        return;
    };
    let client = super::ArcaClient::new(config).unwrap();
    let dummy = client.estado_servidores().await.expect("FEDummy");
    assert!(
        dummy.all_ok(),
        "ARCA no reporta todos los subsistemas OK: {dummy:?}"
    );
}

#[tokio::test]
#[ignore = "requiere credenciales de Homologación"]
async fn integracion_wsaa_y_ultimo_comprobante() {
    let Some(config) = homolog_config_from_env() else {
        eprintln!("saltado: faltan variables ARCA_*");
        return;
    };
    let cache = super::TokenCache::new();
    let client = super::ArcaClient::new(config).unwrap();
    let report = client.validar_instalacion(&cache).await;
    assert!(
        report.ok,
        "validación falló en {:?}: {:#?}",
        report.fallo_en, report.pasos
    );
}
