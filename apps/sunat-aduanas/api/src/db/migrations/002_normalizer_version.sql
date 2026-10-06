-- Rastrea con qué versión del parser se ingestó cada lote. Necesario porque el checksum de
-- un XLSX no cambia cuando se corrige el PARSER (normalize.ts), solo cuando cambia el archivo
-- — sin esta columna, sunat-connector.ts "SKIP ya ingestado (checksum igual)" perpetuaba
-- datos producidos por un parser con bugs ya corregidos en el código, indefinidamente, en
-- cualquier entorno donde el batch ya existiera (hallazgo real de CodeRabbit en PR #241, sobre
-- el bug de columnas desalineadas en normalizeCdro16 corregido el 2026-10-05).
ALTER TABLE raw_batches ADD COLUMN IF NOT EXISTS normalizer_version INTEGER NOT NULL DEFAULT 1;
