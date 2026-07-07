//! Comandos Tauri y persistencia de la configuración ARCA.
//!
//! Este archivo es el **pegamento** entre la UI y el módulo `arca` (protocolo
//! puro). Aquí vive:
//! - la persistencia en la tabla `settings` (local, offline),
//! - el **cifrado en reposo** del certificado y la clave privada con AES-256-GCM
//!   (clave derivada del identificador de la máquina, igual al sistema de
//!   licencias), de modo que una copia de la base en otra PC no revele el
//!   material sensible,
//! - los comandos `#[tauri::command]` que consume el frontend.
//!
//! Toda la lógica de autenticación/firma se delega en el módulo `arca`; aquí no
//! se duplica criptografía ni SOAP.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use base64::Engine as _;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri_plugin_dialog::DialogExt;

use crate::arca::{self, ArcaConfig, ArcaEnvironment, ArcaError, TokenCache};
use crate::db_manager::DbManager;
use crate::settings_util::{read_setting, write_setting};

const K_CUIT: &str = "arca_cuit";
const K_PV: &str = "arca_punto_venta";
const K_AMB: &str = "arca_ambiente";
const K_CERT: &str = "arca_cert_enc";
const K_KEY: &str = "arca_key_enc";

// ── Cifrado en reposo (AES-256-GCM, clave por máquina) ──────────────────────

/// Deriva una clave AES-256 estable a partir del identificador de la máquina.
///
/// Al depender del `machine_id`, el material cifrado solo puede descifrarse en
/// la misma PC donde se guardó (defensa ante una base copiada a otro equipo).
fn machine_key() -> [u8; 32] {
    let machine_id = crate::license::get_machine_id();
    let digest = Sha256::digest(format!("arca-secure-v1:{machine_id}").as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

/// Cifra un texto (PEM) y devuelve `base64(nonce(12) || ciphertext)`.
fn encrypt_secret(plain: &str) -> Result<String, String> {
    let key_bytes = machine_key();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| format!("RNG no disponible: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|_| "No se pudo cifrar el material sensible.".to_string())?;

    let mut blob = Vec::with_capacity(12 + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(blob))
}

/// Descifra un valor previamente producido por [`encrypt_secret`].
fn decrypt_secret(stored: &str) -> Result<String, String> {
    let blob = base64::engine::general_purpose::STANDARD
        .decode(stored.trim())
        .map_err(|e| format!("Dato cifrado inválido: {e}"))?;
    if blob.len() <= 12 {
        return Err("Dato cifrado incompleto.".to_string());
    }
    let (nonce_bytes, ciphertext) = blob.split_at(12);

    let key_bytes = machine_key();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| {
            "No se pudo descifrar el certificado/clave (¿la base se copió de otra PC?)."
                .to_string()
        })?;
    String::from_utf8(plaintext).map_err(|e| format!("Contenido descifrado inválido: {e}"))
}

// ── DTOs ────────────────────────────────────────────────────────────────────

/// Configuración ARCA visible para la UI (sin exponer material sensible).
#[derive(Serialize)]
pub struct ArcaConfigDto {
    pub cuit: String,
    pub punto_venta: u32,
    pub ambiente: String,
    pub cert_cargado: bool,
    pub key_cargada: bool,
    pub configurado: bool,
}

/// Archivo PEM seleccionado por el usuario (leído en memoria, sin copiar a temp).
#[derive(Serialize)]
pub struct ArcaPickedFile {
    pub file_name: String,
    pub pem: String,
}

/// Resultado de la prueba de conexión, con mensajes claros para el usuario.
#[derive(Serialize)]
pub struct ArcaTestResult {
    pub ok: bool,
    pub ambiente: Option<String>,
    pub servidores_ok: bool,
    pub ta_expira: Option<String>,
    pub mensaje: String,
    pub detalle: Option<String>,
}

impl ArcaTestResult {
    fn fail(mensaje: &str, detalle: Option<String>) -> Self {
        Self {
            ok: false,
            ambiente: None,
            servidores_ok: false,
            ta_expira: None,
            mensaje: mensaje.to_string(),
            detalle,
        }
    }
}

// ── Persistencia ──────────────────────────────────────────────────────────

/// Reconstruye una [`ArcaConfig`] lista para usar desde lo almacenado.
///
/// Valida CUIT y punto de venta, descifra el certificado y la clave, y devuelve
/// mensajes claros si falta algún dato.
fn load_arca_config() -> Result<ArcaConfig, String> {
    let (cuit, pv, amb, cert_enc, key_enc) = DbManager::with_connection(|conn| {
        let cuit = read_setting(conn, K_CUIT)
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Falta el CUIT.".to_string())?;
        let pv = read_setting(conn, K_PV)
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| "Falta el punto de venta.".to_string())?;
        let amb = read_setting(conn, K_AMB).unwrap_or_else(|| "homo".to_string());
        let cert_enc = read_setting(conn, K_CERT)
            .ok_or_else(|| "Falta el certificado.".to_string())?;
        let key_enc = read_setting(conn, K_KEY)
            .ok_or_else(|| "Falta la clave privada.".to_string())?;
        Ok((cuit, pv, amb, cert_enc, key_enc))
    })?;

    let cuit_num: u64 = cuit
        .trim()
        .parse()
        .map_err(|_| "El CUIT almacenado es inválido.".to_string())?;
    let pv_num: u32 = pv
        .trim()
        .parse()
        .map_err(|_| "El punto de venta almacenado es inválido.".to_string())?;
    let cert_pem = decrypt_secret(&cert_enc)?;
    let key_pem = decrypt_secret(&key_enc)?;

    let environment = if amb == "prod" {
        ArcaEnvironment::Produccion
    } else {
        ArcaEnvironment::Homologacion
    };

    ArcaConfig::new(cuit_num, pv_num, cert_pem, key_pem, environment).map_err(|e| e.to_string())
}

// ── Comandos Tauri ──────────────────────────────────────────────────────────

/// Devuelve la configuración ARCA actual (sin material sensible).
#[tauri::command]
pub fn arca_obtener_configuracion() -> Result<ArcaConfigDto, String> {
    DbManager::with_connection(|conn| {
        let cuit = read_setting(conn, K_CUIT).unwrap_or_default();
        let punto_venta = read_setting(conn, K_PV)
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(1);
        let ambiente = read_setting(conn, K_AMB).unwrap_or_else(|| "homo".to_string());
        let cert_cargado = read_setting(conn, K_CERT).is_some();
        let key_cargada = read_setting(conn, K_KEY).is_some();
        Ok(ArcaConfigDto {
            configurado: !cuit.trim().is_empty() && cert_cargado && key_cargada,
            cuit,
            punto_venta,
            ambiente,
            cert_cargado,
            key_cargada,
        })
    })
}

/// Guarda la configuración ARCA. El certificado y la clave se cifran en reposo.
///
/// Si se envían certificado y clave (nuevos o ya guardados), valida que el par
/// sea coherente antes de persistir.
#[tauri::command]
pub fn arca_guardar_configuracion(
    cuit: String,
    punto_venta: u32,
    ambiente: String,
    cert_pem: Option<String>,
    key_pem: Option<String>,
) -> Result<(), String> {
    let cuit_num: u64 = cuit
        .trim()
        .parse()
        .map_err(|_| "El CUIT debe ser numérico (11 dígitos).".to_string())?;
    if !(10_000_000_000..=99_999_999_999).contains(&cuit_num) {
        return Err("El CUIT debe tener 11 dígitos.".to_string());
    }
    if punto_venta == 0 {
        return Err("El punto de venta debe ser mayor a cero.".to_string());
    }
    let amb = if ambiente == "prod" { "prod" } else { "homo" };

    // Par efectivo (nuevo o el ya almacenado) para validar coherencia cert/clave.
    let effective_cert = match &cert_pem {
        Some(c) => Some(c.clone()),
        None => DbManager::with_connection(|conn| Ok(read_setting(conn, K_CERT)))?
            .map(|enc| decrypt_secret(&enc))
            .transpose()?,
    };
    let effective_key = match &key_pem {
        Some(k) => Some(k.clone()),
        None => DbManager::with_connection(|conn| Ok(read_setting(conn, K_KEY)))?
            .map(|enc| decrypt_secret(&enc))
            .transpose()?,
    };
    if let (Some(c), Some(k)) = (&effective_cert, &effective_key) {
        arca::validate_keypair(c, k).map_err(|e| e.to_string())?;
    }

    let cert_enc = match cert_pem {
        Some(c) => Some(encrypt_secret(&c)?),
        None => None,
    };
    let key_enc = match key_pem {
        Some(k) => Some(encrypt_secret(&k)?),
        None => None,
    };

    DbManager::with_connection(|conn| {
        write_setting(conn, K_CUIT, &cuit_num.to_string())?;
        write_setting(conn, K_PV, &punto_venta.to_string())?;
        write_setting(conn, K_AMB, amb)?;
        if let Some(c) = &cert_enc {
            write_setting(conn, K_CERT, c)?;
        }
        if let Some(k) = &key_enc {
            write_setting(conn, K_KEY, k)?;
        }
        Ok(())
    })
}

/// Abre un selector de archivos nativo y devuelve el contenido PEM en memoria.
///
/// `kind` es `"cert"` o `"key"`. El archivo se lee directamente desde su
/// ubicación original; **nunca** se copia a un directorio temporal.
#[tauri::command]
pub fn arca_pick_pem_file(
    app: tauri::AppHandle,
    kind: String,
) -> Result<Option<ArcaPickedFile>, String> {
    let (label, exts): (&str, &[&str]) = if kind == "key" {
        ("Clave privada", &["key", "pem", "txt"])
    } else {
        ("Certificado", &["crt", "cer", "pem", "txt"])
    };

    let picked = app
        .dialog()
        .file()
        .add_filter(label, exts)
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.to_string();
    let pem = std::fs::read_to_string(&path)
        .map_err(|e| format!("No se pudo leer el archivo: {e}"))?;

    let looks_valid = if kind == "key" {
        pem.contains("PRIVATE KEY")
    } else {
        pem.contains("CERTIFICATE")
    };
    if !looks_valid {
        return Err(format!(
            "El archivo no parece un {} en formato PEM.",
            label.to_lowercase()
        ));
    }

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or(path);

    Ok(Some(ArcaPickedFile { file_name, pem }))
}

/// Prueba integral de conexión con ARCA.
///
/// Valida la configuración, verifica disponibilidad (`FEDummy`), genera y firma
/// el TRA, solicita Token/Sign a WSAA y reutiliza la caché en memoria. Ante un
/// `soap:Fault` devuelve el mensaje exacto de ARCA.
#[tauri::command]
pub async fn arca_probar_conexion(
    cache: tauri::State<'_, TokenCache>,
) -> Result<ArcaTestResult, String> {
    let config = match load_arca_config() {
        Ok(c) => c,
        Err(e) => return Ok(ArcaTestResult::fail("Configuración incompleta o inválida.", Some(e))),
    };

    let client = match arca::ArcaClient::new(config) {
        Ok(c) => c,
        Err(e) => {
            return Ok(ArcaTestResult::fail(
                "No se pudo inicializar el cliente ARCA.",
                Some(e.to_string()),
            ))
        }
    };

    match client.probar_conexion(cache.inner()).await {
        Ok(info) => Ok(ArcaTestResult {
            ok: true,
            ambiente: Some(info.ambiente),
            servidores_ok: info.servidores_ok,
            ta_expira: Some(info.ta_expira),
            mensaje: "Conexión exitosa con ARCA. Autenticación correcta.".to_string(),
            detalle: None,
        }),
        Err(e) => Ok(map_error(&e)),
    }
}

/// Traduce un [`ArcaError`] a un resultado con mensaje claro para el usuario.
fn map_error(error: &ArcaError) -> ArcaTestResult {
    let (mensaje, detalle) = match error {
        ArcaError::SoapFault { code, message } => (
            "ARCA rechazó la autenticación.",
            Some(format!("[{code}] {message}")),
        ),
        ArcaError::Network(m) => (
            "No hay conexión con ARCA. Verificá tu acceso a internet.",
            Some(m.clone()),
        ),
        ArcaError::Http { status, .. } => {
            return ArcaTestResult::fail(
                "ARCA respondió con un error de servidor.",
                Some(format!("HTTP {status}")),
            )
        }
        ArcaError::InvalidCertificate(m) => ("El certificado no es válido.", Some(m.clone())),
        ArcaError::InvalidPrivateKey(m) => ("La clave privada no es válida.", Some(m.clone())),
        ArcaError::InvalidSignature(m) => ("Falló la firma digital (CMS).", Some(m.clone())),
        ArcaError::Authentication(m) => ("ARCA rechazó la autenticación.", Some(m.clone())),
        ArcaError::TokenExpired => ("El Ticket de Acceso venció; reintentá.", None),
        other => ("No se pudo completar la prueba.", Some(other.to_string())),
    };
    ArcaTestResult::fail(mensaje, detalle)
}
