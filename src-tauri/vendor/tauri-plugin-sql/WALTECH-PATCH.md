# WalTech patch (sobre tauri-plugin-sql 2.4.0)

SQLite pool con `max_connections(1)` + `PRAGMA busy_timeout = 3000` / `foreign_keys` en `after_connect`.

Motivo: el guest JS hace `BEGIN` / statements / `COMMIT` con `pool.execute()` por separado.
Con el pool default (10 conexiones) cada statement puede usar otro handle → transacciones
huérfanas y errores intermitentes «database is locked» / «cannot start a transaction…»
aunque LAN Sync esté apagado.

`busy_timeout` bajo (3s): si Rust escribe, fallar rápido en vez de congelar la UI 30s
("No responde" al cambiar de sección).
