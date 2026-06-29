-- Restaura PIN de fábrica para usuarios base (útil si quedaron inconsistentes).
UPDATE users SET pin = '1234', active = 1 WHERE username = 'admin';
UPDATE users SET pin = '0000', active = 1 WHERE username = 'cajero';
INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_pin', '1234');
UPDATE settings SET value = '1234' WHERE key = 'admin_pin';
