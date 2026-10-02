-- Hallazgo de CodeRabbit en PR #224: reimportar el mismo CSV con exito
-- (dos corridas completas, no una interrumpida) generaba dos batchId
-- distintos, y poblacion_departamental.sql (SID) suma TODAS las filas de
-- padron_electoral_2026 sin filtrar por el batch mas reciente -- una
-- reingesta exitosa duplicaria el denominador poblacional en silencio.
--
-- `completo` distingue un batch que termino de insertar todas sus filas de
-- uno interrumpido a mitad de camino (ver reniec-connector.ts: antes de
-- este fix, un corte de conexion a mitad de carga dejaba un batch con
-- record_count correcto pero filas parciales, indistinguible de uno
-- completo). `checksum` unico permite reclamar el batch de forma atomica
-- via `ON CONFLICT DO NOTHING` -- si ya existe y esta completo, la
-- reingesta se omite; si existe pero quedo incompleto, el conector limpia
-- sus filas parciales y reintenta con el mismo batchId.
ALTER TABLE raw_reniec_batches ADD COLUMN IF NOT EXISTS completo BOOLEAN NOT NULL DEFAULT false;
UPDATE raw_reniec_batches SET completo = true WHERE NOT completo;
ALTER TABLE raw_reniec_batches ADD CONSTRAINT raw_reniec_batches_checksum_key UNIQUE (checksum);
