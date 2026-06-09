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
