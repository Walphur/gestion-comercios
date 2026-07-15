pub mod arca;
mod arca_commands;
mod backup;
mod branding;
mod catalog_setup;
mod commands;
mod connectivity;
mod database;
mod db_maintenance;
mod db_manager;
mod db_path;
mod e2e;
mod export_products;
mod export_sales;
mod fiscal;
pub mod import_products;
mod lan_sync;
mod license;
mod license_commands;
mod mercadopago;
mod mercadopago_oauth;
mod mp_app_credentials;
mod product_search;
mod receipt;
mod settings_util;
mod spreadsheet;
mod sync_worker;
mod whatsapp_commands;
mod whatsapp_turnos;
mod workshop_sync;

use branding::{
    get_business_logo_path, pick_business_logo, remove_business_logo, save_business_logo,
};
use catalog_setup::try_start_bundled_import;
use commands::{
    apply_catalog_setup_choice, check_database_health_cmd, close_cash_session_blind,
    count_catalog_products_cmd, count_recoverable_products_cmd, count_supermarket_products_cmd,
    deactivate_products_cmd, fiscal_consultar_comprobante, fiscal_listar_documentos,
    fiscal_obtener_documento, fiscal_reintentar_fallidos, get_app_storage_info_cmd,
    get_catalog_import_status, get_catalog_wizard_state, get_connection_status,
    get_workshop_sync_status_cmd, import_products_from_csv, import_supermarket_catalog,
    list_supermarket_categories_cmd, log_audit_action, open_cash_session, pick_backup_folder,
    pick_export_products_path, pick_export_sales_detail_path, pick_export_sales_path,
    pick_products_csv_file, pick_products_import_file, pick_supermarket_csv_file,
    pick_workshop_sync_folder, queue_fiscal_invoice, queue_workshop_export,
    reactivate_import_products_cmd, read_text_file, remove_demo_catalog_cmd,
    remove_supermarket_catalog_cmd, repair_database_cmd, restore_database_cmd, run_backup_now,
    run_workshop_sync_now, set_workshop_sync_config, sync_products_fts_cmd, verify_user_pin,
};
use database::open_exclusive;
use db_path::init_db_path;
use e2e::{
    e2e_bulk_deactivate_products, e2e_bulk_update_products, e2e_ensure_baseline_template,
    e2e_integrity_check, e2e_mark_catalog_setup_done, e2e_reset_environment, e2e_seed_products,
    e2e_seed_sales,
};
use license_commands::{
    license_activate, license_get_machine_id, license_get_status, license_refresh,
    license_skip_trial_offer, license_start_trial,
};
use mercadopago::{check_mp_order_status, create_mp_qr_order, get_mp_config_status};
use mercadopago_oauth::{
    connect_mp_oauth, disconnect_mp_oauth, repair_mp_store_and_pos,
    scan_startup_args_for_oauth_deep_link, try_handle_oauth_deep_link,
};
use mp_app_credentials::{register_install_resource_dir, sync_mp_oauth_to_app_storage};
use receipt::{print_sale_receipt, test_printer_connection};
use settings_util::{read_setting_flag, read_setting_or};
use sync_worker::spawn_sync_worker;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use whatsapp_turnos::spawn_whatsapp_turnos_worker;
use workshop_sync::spawn_workshop_sync_worker;

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
        Migration {
            version: 14,
            description: "sales_mp_payment_refs",
            sql: include_str!("../migrations/0014_sales_mp_payment.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "fts_standalone_no_triggers",
            sql: include_str!("../migrations/0015_fts_standalone.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "restore_default_pins",
            sql: include_str!("../migrations/0016_restore_default_pins.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "fiscal_arca_extended",
            sql: include_str!("../migrations/0017_fiscal_arca.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "workshop_resources",
            sql: include_str!("../migrations/0018_workshop_resources.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 19,
            description: "appointment_whatsapp",
            sql: include_str!("../migrations/0019_appointment_whatsapp.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 20,
            description: "appointment_notifications_seen",
            sql: include_str!("../migrations/0020_appointment_notifications_seen.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 21,
            description: "lan_sync",
            sql: include_str!("../migrations/0021_lan_sync.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(arca::auth::shared_token_cache())
        .plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            for arg in argv {
                if arg.contains("gestioncomercios://") {
                    try_handle_oauth_deep_link(&arg);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
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
            if let Ok(dir) = app.path().resource_dir() {
                register_install_resource_dir(dir);
            }
            sync_mp_oauth_to_app_storage();
            if let Ok(conn) = open_exclusive() {
                if read_setting_flag(&conn, "mp_oauth_connected")
                    && read_setting_or(&conn, "mp_external_pos_id", "")
                        .trim()
                        .is_empty()
                {
                    let _ = repair_mp_store_and_pos(&conn);
                }
            }
            scan_startup_args_for_oauth_deep_link();
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().on_open_url(|event| {
                    for url in event.urls() {
                        try_handle_oauth_deep_link(url.as_ref());
                    }
                });
            }
            try_start_bundled_import(app.handle());
            spawn_sync_worker(30);
            spawn_workshop_sync_worker(120);
            spawn_whatsapp_turnos_worker(120);
            lan_sync::engine::try_autostart();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_connection_status,
            queue_fiscal_invoice,
            fiscal_obtener_documento,
            fiscal_consultar_comprobante,
            fiscal_listar_documentos,
            fiscal_reintentar_fallidos,
            run_backup_now,
            log_audit_action,
            open_cash_session,
            close_cash_session_blind,
            verify_user_pin,
            pick_products_csv_file,
            pick_products_import_file,
            read_text_file,
            pick_export_products_path,
            pick_export_sales_path,
            pick_export_sales_detail_path,
            export_products::export_products_csv,
            export_sales::export_sales_csv,
            export_sales::export_sales_detail_csv,
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
            count_recoverable_products_cmd,
            reactivate_import_products_cmd,
            deactivate_products_cmd,
            sync_products_fts_cmd,
            get_app_storage_info_cmd,
            pick_business_logo,
            save_business_logo,
            get_business_logo_path,
            remove_business_logo,
            get_workshop_sync_status_cmd,
            set_workshop_sync_config,
            pick_workshop_sync_folder,
            pick_backup_folder,
            queue_workshop_export,
            run_workshop_sync_now,
            create_mp_qr_order,
            check_mp_order_status,
            get_mp_config_status,
            connect_mp_oauth,
            disconnect_mp_oauth,
            print_sale_receipt,
            test_printer_connection,
            license_get_status,
            license_get_machine_id,
            license_activate,
            license_refresh,
            license_start_trial,
            license_skip_trial_offer,
            e2e_integrity_check,
            e2e_ensure_baseline_template,
            e2e_reset_environment,
            e2e_seed_products,
            e2e_bulk_update_products,
            e2e_bulk_deactivate_products,
            e2e_seed_sales,
            e2e_mark_catalog_setup_done,
            arca_commands::arca_obtener_configuracion,
            arca_commands::arca_guardar_configuracion,
            arca_commands::arca_pick_pem_file,
            arca_commands::arca_probar_conexion,
            arca_commands::arca_validar_instalacion,
            arca_commands::arca_obtener_estado,
            arca_commands::arca_renovar_token,
            arca_commands::arca_consultar_ultimo_comprobante,
            arca_commands::arca_set_simulacion,
            whatsapp_commands::whatsapp_turnos_get_config,
            whatsapp_commands::whatsapp_turnos_save_config,
            whatsapp_commands::whatsapp_turnos_register,
            whatsapp_commands::whatsapp_turnos_get_status,
            whatsapp_commands::whatsapp_turnos_sync_now,
            lan_sync::lan_sync_get_status,
            lan_sync::lan_sync_save_config,
            lan_sync::lan_sync_start_server,
            lan_sync::lan_sync_stop_server,
            lan_sync::lan_sync_connect,
            lan_sync::lan_sync_disconnect,
            lan_sync::lan_sync_discover,
            lan_sync::lan_sync_test_connection,
            lan_sync::lan_sync_list_logs,
            lan_sync::lan_sync_pending_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
