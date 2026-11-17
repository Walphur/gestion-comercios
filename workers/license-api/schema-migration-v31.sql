-- Preferencia de modalidad del alta (accounts), hasta el verify.
-- Etapa 4 dos modalidades: register guarda preferred_modality; verify la aplica a licenses.
-- Seguro si la columna ya existe: falla ese ALTER y el resto no aplica (correr a mano solo ADD).

ALTER TABLE accounts ADD COLUMN preferred_modality TEXT;
