use crate::arca::secrets::{decrypt_secret, encrypt_secret};
use crate::connectivity::is_online;
use crate::database::open_exclusive;
use crate::license::get_machine_id;
use crate::settings_util::{read_setting, read_setting_flag, read_setting_or, write_setting, write_setting_flag};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

static WORKER_RUNNING: AtomicBool = AtomicBool::new(false);

const SETTING_ENABLED: &str = "whatsapp_turnos_enabled";
const SETTING_PHONE_NUMBER_ID: &str = "whatsapp_phone_number_id";
const SETTING_ACCESS_TOKEN: &str = "whatsapp_access_token";
const SETTING_API_TOKEN: &str = "whatsapp_api_token";
const SETTING_VERIFY_TOKEN: &str = "whatsapp_webhook_verify_token";
const SETTING_REMINDER_HOURS: &str = "whatsapp_reminder_hours";
const SETTING_TEMPLATE_NAME: &str = "whatsapp_template_name";
const SETTING_TEMPLATE_LANG: &str = "whatsapp_template_lang";

fn api_url() -> String {
    option_env!("WHATSAPP_TURNOS_API_URL")
        .unwrap_or("https://gestion-whatsapp-turnos.walphur.workers.dev")
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTurnosConfig {
    pub enabled: bool,
    pub phone_number_id: String,
    pub access_token_set: bool,
    pub api_token_set: bool,
    pub webhook_verify_token: String,
    pub reminder_hours: u32,
    pub template_name: String,
    pub template_lang: String,
    pub webhook_url: String,
    pub registered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhatsAppTurnosStatus {
    pub configured: bool,
    pub enabled: bool,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub pending_updates: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncAppointmentRow {
    appointment_id: i64,
    customer_phone: String,
    customer_name: Option<String>,
    title: String,
    starts_at: String,
    ends_at: String,
    status: String,
    resource_name: Option<String>,
    vehicle_plate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RegisterResponse {
    ok: bool,
    api_token: Option<String>,
    webhook_url: Option<String>,
    message: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PendingUpdate {
    id: String,
    appointment_id: i64,
    action: String,
    customer_phone: Option<String>,
    customer_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PendingUpdatesResponse {
    ok: bool,
    updates: Option<Vec<PendingUpdate>>,
    message: Option<String>,
    error: Option<String>,
}

fn post_json<T: for<'de> Deserialize<'de>>(
    path: &str,
    body: &serde_json::Value,
    bearer: Option<&str>,
) -> Result<T, String> {
    let url = format!("{}{}", api_url(), path);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(&url).json(body);
    if let Some(token) = bearer {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let res = req.send().map_err(|e| format!("Sin conexión al servicio de WhatsApp: {e}"))?;
    let status = res.status();
    let text = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        if let Ok(err) = serde_json::from_str::<RegisterResponse>(&text) {
            return Err(err
                .message
                .or(err.error)
                .unwrap_or_else(|| format!("Servicio respondió {status}")));
        }
        return Err(format!("Servicio de WhatsApp respondió {status}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Respuesta inválida: {e}"))
}

fn get_json<T: for<'de> Deserialize<'de>>(path: &str, bearer: &str) -> Result<T, String> {
    let url = format!("{}{}", api_url(), path);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(&url)
        .header("authorization", format!("Bearer {bearer}"))
        .send()
        .map_err(|e| format!("Sin conexión al servicio de WhatsApp: {e}"))?;
    let status = res.status();
    let text = res.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Servicio de WhatsApp respondió {status}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Respuesta inválida: {e}"))
}

fn read_encrypted_setting(conn: &Connection, key: &str) -> Option<String> {
    let stored = read_setting(conn, key)?;
    decrypt_secret(&stored).ok()
}

fn write_encrypted_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let enc = encrypt_secret(value)?;
    write_setting(conn, key, &enc)
}

pub fn get_whatsapp_turnos_config() -> Result<WhatsAppTurnosConfig, String> {
    let conn = open_exclusive()?;
    let enabled = read_setting_flag(&conn, SETTING_ENABLED);
    let phone_number_id = read_setting_or(&conn, SETTING_PHONE_NUMBER_ID, "");
    let access_token_set = read_setting(&conn, SETTING_ACCESS_TOKEN).is_some();
    let api_token_set = read_setting(&conn, SETTING_API_TOKEN).is_some();
    let webhook_verify_token = read_setting_or(&conn, SETTING_VERIFY_TOKEN, "");
    let reminder_hours = read_setting_or(&conn, SETTING_REMINDER_HOURS, "24")
        .parse::<u32>()
        .unwrap_or(24)
        .clamp(1, 72);
    let template_name = read_setting_or(&conn, SETTING_TEMPLATE_NAME, "gc_recordatorio_turno");
    let template_lang = read_setting_or(&conn, SETTING_TEMPLATE_LANG, "es_AR");
    let registered = api_token_set && !phone_number_id.trim().is_empty() && access_token_set;
    Ok(WhatsAppTurnosConfig {
        enabled,
        phone_number_id,
        access_token_set,
        api_token_set,
        webhook_verify_token,
        reminder_hours,
        template_name,
        template_lang,
        webhook_url: format!("{}/webhook", api_url()),
        registered,
    })
}

pub fn save_whatsapp_turnos_config(
    enabled: bool,
    phone_number_id: String,
    access_token: Option<String>,
    reminder_hours: u32,
    template_name: String,
    template_lang: String,
) -> Result<WhatsAppTurnosConfig, String> {
    let conn = open_exclusive()?;
    write_setting_flag(&conn, SETTING_ENABLED, enabled)?;
    write_setting(&conn, SETTING_PHONE_NUMBER_ID, phone_number_id.trim())?;
    if let Some(token) = access_token.filter(|t| !t.trim().is_empty()) {
        write_encrypted_setting(&conn, SETTING_ACCESS_TOKEN, token.trim())?;
    }
    write_setting(
        &conn,
        SETTING_REMINDER_HOURS,
        &reminder_hours.clamp(1, 72).to_string(),
    )?;
    write_setting(
        &conn,
        SETTING_TEMPLATE_NAME,
        template_name.trim(),
    )?;
    write_setting(&conn, SETTING_TEMPLATE_LANG, template_lang.trim())?;

    let verify = read_setting_or(&conn, SETTING_VERIFY_TOKEN, "");
    if verify.trim().is_empty() {
        let generated = uuid::Uuid::new_v4().to_string();
        write_setting(&conn, SETTING_VERIFY_TOKEN, &generated)?;
    }

    get_whatsapp_turnos_config()
}

pub fn register_whatsapp_turnos(business_name: String) -> Result<WhatsAppTurnosConfig, String> {
    if !is_online() {
        return Err("Necesitás internet para registrar WhatsApp Business.".to_string());
    }
    let conn = open_exclusive()?;
    let phone_number_id = read_setting_or(&conn, SETTING_PHONE_NUMBER_ID, "");
    let access_token = read_encrypted_setting(&conn, SETTING_ACCESS_TOKEN)
        .ok_or_else(|| "Cargá el token de acceso de WhatsApp Business.".to_string())?;
    let verify_token = read_setting_or(&conn, SETTING_VERIFY_TOKEN, "");
    if phone_number_id.trim().is_empty() || verify_token.trim().is_empty() {
        return Err("Completá el Phone Number ID y guardá la configuración primero.".to_string());
    }
    let reminder_hours = read_setting_or(&conn, SETTING_REMINDER_HOURS, "24")
        .parse::<u32>()
        .unwrap_or(24);
    let template_name = read_setting_or(&conn, SETTING_TEMPLATE_NAME, "gc_recordatorio_turno");
    let template_lang = read_setting_or(&conn, SETTING_TEMPLATE_LANG, "es_AR");

    let body = serde_json::json!({
        "machine_id": get_machine_id(),
        "phone_number_id": phone_number_id.trim(),
        "access_token": access_token,
        "business_name": business_name.trim(),
        "reminder_hours": reminder_hours,
        "webhook_verify_token": verify_token.trim(),
        "template_name": template_name.trim(),
        "template_lang": template_lang.trim(),
    });

    let res: RegisterResponse = post_json("/v1/register", &body, None)?;
    let api_token = res
        .api_token
        .ok_or_else(|| "El servidor no devolvió token de API.".to_string())?;
    write_encrypted_setting(&conn, SETTING_API_TOKEN, &api_token)?;
    get_whatsapp_turnos_config()
}

fn load_sync_appointments(conn: &Connection) -> Result<Vec<SyncAppointmentRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id AS appointment_id,
                    c.phone AS customer_phone,
                    c.name AS customer_name,
                    a.title,
                    a.starts_at,
                    a.ends_at,
                    a.status,
                    a.resource_name,
                    v.plate AS vehicle_plate
             FROM appointments a
             LEFT JOIN customers c ON c.id = a.customer_id
             LEFT JOIN vehicles v ON v.id = a.vehicle_id
             WHERE a.starts_at >= datetime('now','localtime')
               AND a.status NOT IN ('completed', 'cancelled', 'no_show')
               AND c.phone IS NOT NULL AND trim(c.phone) != ''
             ORDER BY a.starts_at
             LIMIT 120",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SyncAppointmentRow {
                appointment_id: row.get(0)?,
                customer_phone: row.get(1)?,
                customer_name: row.get(2)?,
                title: row.get(3)?,
                starts_at: row.get(4)?,
                ends_at: row.get(5)?,
                status: row.get(6)?,
                resource_name: row.get(7)?,
                vehicle_plate: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn apply_pending_update(conn: &Connection, update: &PendingUpdate) -> Result<(), String> {
    let status = match update.action.as_str() {
        "confirm" => "confirmed",
        "cancel" => "cancelled",
    "reschedule" => {
        conn.execute(
            "INSERT INTO appointment_notifications (appointment_id, kind, channel)
             VALUES (?1, 'whatsapp_reschedule', 'whatsapp')",
            params![update.appointment_id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
        _ => return Ok(()),
    };
    conn.execute(
        "UPDATE appointments SET status = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![status, update.appointment_id],
    )
    .map_err(|e| e.to_string())?;

    let kind = if status == "confirmed" {
        "whatsapp_confirmed"
    } else {
        "whatsapp_cancelled"
    };
    conn.execute(
        "INSERT INTO appointment_notifications (appointment_id, kind, channel)
         VALUES (?1, ?2, 'whatsapp')",
        params![update.appointment_id, kind],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run_whatsapp_turnos_sync_once() -> Result<WhatsAppTurnosStatus, String> {
    let conn = open_exclusive()?;
    if !read_setting_flag(&conn, SETTING_ENABLED) {
        return Ok(WhatsAppTurnosStatus {
            configured: false,
            enabled: false,
            last_sync_at: read_setting(&conn, "whatsapp_last_sync_at"),
            last_error: None,
            pending_updates: 0,
        });
    }

    let api_token = read_encrypted_setting(&conn, SETTING_API_TOKEN)
        .ok_or_else(|| "Registrá WhatsApp Business en Configuración.".to_string())?;

    if !is_online() {
        return Err("Sin internet. Reintentaremos automáticamente.".to_string());
    }

    let appointments = load_sync_appointments(&conn)?;
    let sync_body = serde_json::json!({
        "appointments": appointments.iter().map(|a| serde_json::json!({
            "appointment_id": a.appointment_id,
            "customer_phone": a.customer_phone,
            "customer_name": a.customer_name,
            "title": a.title,
            "starts_at": a.starts_at,
            "ends_at": a.ends_at,
            "status": a.status,
            "resource_name": a.resource_name,
            "vehicle_plate": a.vehicle_plate,
        })).collect::<Vec<_>>()
    });
    post_json::<serde_json::Value>("/v1/sync-appointments", &sync_body, Some(&api_token))?;

    let pending: PendingUpdatesResponse = get_json("/v1/pending-updates", &api_token)?;
    let updates = pending.updates.unwrap_or_default();
    let mut ack_ids: Vec<String> = Vec::new();
    for update in &updates {
        if let Err(e) = apply_pending_update(&conn, update) {
            eprintln!("[whatsapp_turnos] apply update: {e}");
            continue;
        }
        ack_ids.push(update.id.clone());
    }
    if !ack_ids.is_empty() {
        let ack_body = serde_json::json!({ "ids": ack_ids });
        let _ = post_json::<serde_json::Value>("/v1/ack-updates", &ack_body, Some(&api_token));
    }

    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    write_setting(&conn, "whatsapp_last_sync_at", &ts)?;
    write_setting(&conn, "whatsapp_last_error", "")?;

    Ok(WhatsAppTurnosStatus {
        configured: true,
        enabled: true,
        last_sync_at: Some(ts),
        last_error: None,
        pending_updates: updates.len() as u32,
    })
}

pub fn get_whatsapp_turnos_status() -> WhatsAppTurnosStatus {
    let Ok(conn) = open_exclusive() else {
        return WhatsAppTurnosStatus {
            configured: false,
            enabled: false,
            last_sync_at: None,
            last_error: Some("Base de datos no disponible.".to_string()),
            pending_updates: 0,
        };
    };
    let enabled = read_setting_flag(&conn, SETTING_ENABLED);
    let configured = read_setting(&conn, SETTING_API_TOKEN).is_some();
    WhatsAppTurnosStatus {
        configured,
        enabled,
        last_sync_at: read_setting(&conn, "whatsapp_last_sync_at"),
        last_error: read_setting(&conn, "whatsapp_last_error").filter(|s| !s.is_empty()),
        pending_updates: 0,
    }
}

pub fn spawn_whatsapp_turnos_worker(interval_secs: u64) {
    if WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(12));
        loop {
            if let Ok(conn) = open_exclusive() {
                if read_setting_flag(&conn, SETTING_ENABLED) {
                    if let Err(e) = run_whatsapp_turnos_sync_once() {
                        eprintln!("[whatsapp_turnos] {e}");
                        let _ = write_setting(&conn, "whatsapp_last_error", &e);
                    }
                }
            }
            thread::sleep(Duration::from_secs(interval_secs.max(60)));
        }
    });
}
