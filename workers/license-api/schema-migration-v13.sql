-- Respuestas opcionales del registro (cómo nos conoció, con qué llevaba el negocio, objetivo, equipo).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v13.sql

ALTER TABLE accounts ADD COLUMN heard_from TEXT;
ALTER TABLE accounts ADD COLUMN previous_tool TEXT;
ALTER TABLE accounts ADD COLUMN goal TEXT;
ALTER TABLE accounts ADD COLUMN team_size TEXT;
