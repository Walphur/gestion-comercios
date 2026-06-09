mod backup;
mod branding;
mod catalog_setup;
mod commands;
mod connectivity;
mod database;
mod db_maintenance;
mod db_path;
mod export_products;
mod fiscal;
pub mod import_products;
mod mercadopago;
mod mercadopago_oauth;
mod mp_app_credentials;
mod product_search;
mod receipt;
mod settings_util;
mod spreadsheet;
mod sync_worker;
mod workshop_sync;

use catalog_setup::try_start_bundled_import;
use branding::{
    get_business_logo_path, pick_business_logo, remove_business_logo, save_business_logo,
};
use commands::{
    apply_catalog_setup_choice, close_cash_session_blind, count_supermarket_products_cmd,
    get_catalog_import_status, get_catalog_wizard_state, get_connection_status,
    check_database_health_cmd, count_catalog_products_cmd, get_app_storage_info_cmd,
    import_products_from_csv,
    import_supermarket_catalog, list_supermarket_categories_cmd, log_audit_action,
    open_cash_session, pick_export_products_path, pick_products_csv_file,
    pick_products_import_file, pick_supermarket_csv_file, queue_fiscal_invoice,
    remove_demo_catalog_cmd, remove_supermarket_catalog_cmd,
    repair_database_cmd, restore_database_cmd, run_backup_now, verify_user_pin,
    get_workshop_sync_status_cmd, set_workshop_sync_config, pick_workshop_sync_folder,
    queue_workshop_export, run_workshop_sync_now,
};
use mercadopago::{check_mp_order_status, create_mp_qr_order, get_mp_config_status};
use mercadopago_oauth::{connect_mp_oauth, disconnect_mp_oauth};
use receipt::{print_sale_receipt, test_printer_connection};
use db_path::init_db_path;
use sync_worker::spawn_sync_worker;
use workshop_sync::spawn_workshop_sync_worker;
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
        Migration {
            version: 4,
            description: "customers_and_sale_void",
            sql: include_str!("../migrations/0004_customers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "brands_suppliers",
            sql: include_str!("../migrations/0005_brands_suppliers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "phase_a_cash_movements_fts",
            sql: include_str!("../migrations/0006_phase_a.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "product_expiry",
            sql: include_str!("../migrations/0007_product_expiry.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "catalog_source",
            sql: include_str!("../migrations/0008_catalog_source.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "quotes",
            sql: include_str!("../migrations/0009_quotes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "appointments",
            sql: include_str!("../migrations/0010_appointments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "remitos_service_orders",
            sql: include_str!("../migrations/0011_remitos_service_orders.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "vehicles_workflow",
            sql: include_str!("../migrations/0012_vehicles_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "workshop_sync",
            sql: include_str!("../migrations/0013_workshop_sync.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:gestion.db", migrations)
                .build(),
        )
        .setup(|app| {
            init_db_path(app.handle())?;
            try_start_bundled_import(app.handle());
            spawn_sync_worker(30);
            spawn_workshop_sync_worker(120);
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
            pick_products_import_file,
            pick_export_products_path,
            export_products::export_products_csv,
            import_products_from_csv,
            import_supermarket_catalog,
            get_catalog_import_status,
            get_catalog_wizard_state,
            list_supermarket_categories_cmd,
            apply_catalog_setup_choice,
            remove_demo_catalog_cmd,
            remove_supermarket_catalog_cmd,
            count_supermarket_products_cmd,
            pick_supermarket_csv_file,
            check_database_health_cmd,
            repair_database_cmd,
            restore_database_cmd,
            count_catalog_products_cmd,
            get_app_storage_info_cmd,
            pick_business_logo,
            save_business_logo,
            get_business_logo_path,
            remove_business_logo,
            get_workshop_sync_status_cmd,
            set_workshop_sync_config,
            pick_workshop_sync_folder,
            queue_workshop_export,
            run_workshop_sync_now,
            create_mp_qr_order,
            check_mp_order_status,
            get_mp_config_status,
            connect_mp_oauth,
            disconnect_mp_oauth,
            print_sale_receipt,
            test_printer_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
