use rusqlite::Connection;

pub fn read_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |r| r.get(0),
    )
    .ok()
}

pub fn read_setting_or(conn: &Connection, key: &str, default: &str) -> String {
    read_setting(conn, key).unwrap_or_else(|| default.to_string())
}

pub fn read_setting_flag(conn: &Connection, key: &str) -> bool {
    read_setting(conn, key).as_deref() == Some("1")
}

pub fn write_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn write_setting_flag(conn: &Connection, key: &str, enabled: bool) -> Result<(), String> {
    write_setting(conn, key, if enabled { "1" } else { "0" })
}
