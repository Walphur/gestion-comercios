-- Phase 0.5b: Snapshot de catálogo LAN (Caso A)

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('lan_sync_snapshot_status', 'off'),
    ('lan_sync_snapshot_id', ''),
    ('lan_sync_snapshot_applied_id', ''),
    ('lan_sync_snapshot_includes_stock_seed', '1'),
    ('lan_sync_snapshot_download_offset', '0'),
    ('lan_sync_snapshot_last_error', '');
