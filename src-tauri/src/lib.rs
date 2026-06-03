mod backup;
mod commands;
mod connectivity;
mod db_path;
mod fiscal;
mod import_products;
mod sync_worker;

use commands::{
    close_cash_session_blind, get_connection_status, import_products_from_csv,
    log_audit_action, open_cash_session, pick_products_csv_file, queue_fiscal_invoice,
    run_backup_now, verify_user_pin,
};
use db_path::init_db_path;
use sync_worker::spawn_sync_worker;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_sales_tables",
            sql: include_str!("../migrations/0002_sales.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "core_infra_stock_sync_audit_cash",
            sql: include_str!("../migrations/0003_core_infra.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:gestion.db", migrations)
                .build(),
        )
        .setup(|app| {
            init_db_path(app.handle())?;
            spawn_sync_worker(30);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_connection_status,
            queue_fiscal_invoice,
            run_backup_now,
            log_audit_action,
            open_cash_session,
            close_cash_session_blind,
            verify_user_pin,
            pick_products_csv_file,
            import_products_from_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
