# WalTech patch (sobre tauri-plugin-sql 2.4.0)

SQLite pool con `max_connections(1)` + `PRAGMA busy_timeout` / `foreign_keys` en `after_connect`.

Motivo: el guest JS hace `BEGIN` / statements / `COMMIT` con `pool.execute()` por separado.
Con el pool default (10 conexiones) cada statement puede usar otro handle → transacciones
huérfanas y errores intermitentes «database is locked» / «cannot start a transaction…»
aunque LAN Sync esté apagado.
