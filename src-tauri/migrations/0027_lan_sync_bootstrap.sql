-- Phase 0.5a: Bootstrap de catálogo LAN (estado + manifest)

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('lan_sync_bootstrap_status', 'off'),
    ('lan_sync_bootstrap_generation', '0'),
    ('lan_sync_bootstrap_session_id', ''),
    ('lan_sync_bootstrap_source_device', ''),
    ('lan_sync_bootstrap_cursor_lamport', '0'),
    ('lan_sync_bootstrap_cursor_event_id', ''),
    ('lan_sync_bootstrap_counts', '{}'),
    ('lan_sync_bootstrap_lamport_start', '0'),
    ('lan_sync_bootstrap_lamport_end', '0'),
    ('lan_sync_bootstrap_products_with_variants', '0');

CREATE TABLE IF NOT EXISTS lan_sync_bootstrap_manifest (
    generation   INTEGER NOT NULL,
    entity_type  TEXT NOT NULL,
    sync_id      TEXT NOT NULL,
    PRIMARY KEY (generation, entity_type, sync_id)
);

CREATE INDEX IF NOT EXISTS idx_lan_bootstrap_manifest_gen
    ON lan_sync_bootstrap_manifest(generation);
