-- Corrige un bug real encontrado en vivo durante la primera ingesta completa (2026-09-22):
-- `dni_hash` tenía NOT NULL en 002, pero `normalizeConformacion()` produce `dniHash: null`
-- legítimamente cuando la fuente (JNE) no trae `strDocumentoIdentidad` para una fila — esto
-- detuvo la ingesta de varios distritos (confirmado: ubigeo 021203, HUAYLLAPAMPA) hasta
-- corregirlo. La ausencia de DNI en la fuente no es un error de nuestro conector, así que la
-- columna debe permitir NULL, igual que ya lo hacía el resto del modelo de datos (apellido
-- materno, organización política, etc., todos opcionales en la fuente).

ALTER TABLE autoridades_vigentes ALTER COLUMN dni_hash DROP NOT NULL;
