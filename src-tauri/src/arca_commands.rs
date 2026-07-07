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

use std::sync::Arc;

use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

use crate::arca::secrets::{decrypt_secret, encrypt_secret};
use crate::arca::{self, load_arca_config, ArcaError, InstallReport, TokenCache};
use crate::db_manager::DbManager;
use crate::settings_util::{read_setting, write_setting};

const K_CUIT: &str = "arca_cuit";
const K_PV: &str = "arca_punto_venta";
const K_AMB: &str = "arca_ambiente";
const K_CERT: &str = "arca_cert_enc";
const K_KEY: &str = "arca_key_enc";

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
        // Coherencia del par y validez del certificado (vigencia + longitud).
        arca::validate_keypair(c, k).map_err(|e| e.to_string())?;
        arca::inspect_certificate(c).map_err(|e| e.to_string())?;
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
    let pem =
        std::fs::read_to_string(&path).map_err(|e| format!("No se pudo leer el archivo: {e}"))?;

    let is_key = kind == "key";
    let pem = arca::normalize_pem(&pem, is_key).map_err(|e| e.to_string())?;

    let looks_valid = if is_key {
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
    cache: tauri::State<'_, Arc<TokenCache>>,
) -> Result<ArcaTestResult, String> {
    let config = match load_arca_config() {
        Ok(c) => c,
        Err(e) => {
            return Ok(ArcaTestResult::fail(
                "Configuración incompleta o inválida.",
                Some(e),
            ))
        }
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

/// Valida la instalación ARCA de punta a punta (config → cert → clave → par →
/// TRA → CMS → LoginCMS → FEDummy → FECompUltimoAutorizado) y devuelve un
/// informe paso a paso indicando exactamente qué falló.
#[tauri::command]
pub async fn arca_validar_instalacion(
    cache: tauri::State<'_, Arc<TokenCache>>,
) -> Result<InstallReport, String> {
    let config = match load_arca_config() {
        Ok(c) => c,
        Err(e) => {
            return Ok(InstallReport {
                ok: false,
                fallo_en: Some("Configuración".to_string()),
                pasos: vec![arca::CheckStep {
                    nombre: "Configuración".to_string(),
                    ok: Some(false),
                    detalle: Some(e),
                }],
            })
        }
    };

    let client = match arca::ArcaClient::new(config) {
        Ok(c) => c,
        Err(e) => {
            return Ok(InstallReport {
                ok: false,
                fallo_en: Some("Configuración".to_string()),
                pasos: vec![arca::CheckStep {
                    nombre: "Configuración".to_string(),
                    ok: Some(false),
                    detalle: Some(e.to_string()),
                }],
            })
        }
    };

    Ok(client.validar_instalacion(cache.inner()).await)
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

fn format_cuit(cuit: u64) -> String {
    let s = format!("{cuit:011}");
    format!("{}-{}-{}", &s[0..2], &s[2..10], &s[10..11])
}

fn humanize_seconds_ago(secs: i64) -> String {
    if secs < 60 {
        format!("Hace {secs} segundos")
    } else if secs < 3600 {
        format!("Hace {} minutos", secs / 60)
    } else {
        format!("Hace {} horas", secs / 3600)
    }
}

/// Estado en vivo de ARCA para el panel de administración.
#[derive(Serialize)]
pub struct ArcaEstadoDto {
    pub conectado: bool,
    pub ambiente: String,
    pub cuit: String,
    pub cuit_formateado: String,
    pub punto_venta: u32,
    pub token_valido: bool,
    pub token_expira: Option<String>,
    pub cert_valido: bool,
    pub cert_dias_restantes: Option<i64>,
    pub ultimo_cae: Option<String>,
    pub ultima_comunicacion_label: String,
    pub simulacion: bool,
}

#[tauri::command]
pub async fn arca_obtener_estado(
    cache: tauri::State<'_, Arc<TokenCache>>,
) -> Result<ArcaEstadoDto, String> {
    let cfg_dto = arca_obtener_configuracion()?;
    let simulacion = arca::is_simulation_mode();

    let mut token_valido = false;
    let mut token_expira = None;
    let mut cert_valido = false;
    let mut cert_dias = None;
    let mut conectado = false;

    if let Ok(config) = load_arca_config() {
        if let Ok(rep) = arca::inspect_certificate(config.cert_pem()) {
            cert_valido = true;
            cert_dias = Some(rep.days_to_expiry);
        }
        if let Ok(Some(ticket)) = cache.get_valid_sync() {
            token_valido = true;
            token_expira = Some(crate::arca::utils::format_iso8601(&ticket.expiration_time));
        } else if let Ok(client) = arca::ArcaClient::new(config.clone()) {
            if let Ok(info) = client.probar_conexion(cache.as_ref()).await {
                conectado = info.servidores_ok;
                token_valido = true;
                token_expira = Some(info.ta_expira);
            }
        }
    }

    let ultimo_cae = DbManager::with_connection(|conn| {
        let row: Option<String> = conn
            .query_row(
                "SELECT voucher_number FROM fiscal_documents
                 WHERE cae IS NOT NULL ORDER BY id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .ok();
        Ok(row)
    })?;

    let ultima_label = DbManager::with_connection(|conn| {
        let ts = read_setting(conn, "arca_last_ok_at");
        Ok(match ts.and_then(|t| t.parse::<i64>().ok()) {
            Some(epoch) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                humanize_seconds_ago((now - epoch).max(0))
            }
            None => "Sin comunicación reciente".into(),
        })
    })?;

    Ok(ArcaEstadoDto {
        conectado,
        ambiente: if cfg_dto.ambiente == "prod" {
            "Producción".into()
        } else {
            "Homologación".into()
        },
        cuit: cfg_dto.cuit.clone(),
        cuit_formateado: cfg_dto
            .cuit
            .parse::<u64>()
            .map(format_cuit)
            .unwrap_or(cfg_dto.cuit),
        punto_venta: cfg_dto.punto_venta,
        token_valido,
        token_expira,
        cert_valido,
        cert_dias_restantes: cert_dias,
        ultimo_cae,
        ultima_comunicacion_label: ultima_label,
        simulacion,
    })
}

/// Fuerza renovación del Token invalidando la caché y solicitando uno nuevo.
#[tauri::command]
pub async fn arca_renovar_token(
    cache: tauri::State<'_, Arc<TokenCache>>,
) -> Result<String, String> {
    cache.invalidate().map_err(|e| e.to_string())?;
    let config = load_arca_config()?;
    let client = arca::ArcaClient::new(config).map_err(|e| e.to_string())?;
    let ticket = client
        .autenticar(cache.as_ref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(crate::arca::utils::format_iso8601(&ticket.expiration_time))
}

/// Consulta el último comprobante autorizado en ARCA.
#[tauri::command]
pub async fn arca_consultar_ultimo_comprobante(
    cache: tauri::State<'_, Arc<TokenCache>>,
    cbte_tipo: Option<u32>,
) -> Result<String, String> {
    let config = load_arca_config()?;
    let client = arca::ArcaClient::new(config).map_err(|e| e.to_string())?;
    let tipo = cbte_tipo.unwrap_or_else(arca::default_cbte_tipo);
    let nro = client
        .ultimo_comprobante(cache.as_ref(), tipo)
        .await
        .map_err(|e| e.to_string())?;
    let pv = arca_obtener_configuracion()?.punto_venta;
    Ok(format!("{:04}-{:08}", pv, nro))
}

/// Activa o desactiva el modo simulación (sin consumir ARCA real).
#[tauri::command]
pub fn arca_set_simulacion(enabled: bool) -> Result<(), String> {
    DbManager::with_connection(|conn| {
        write_setting(conn, "arca_simulation", if enabled { "1" } else { "0" })
    })
}
