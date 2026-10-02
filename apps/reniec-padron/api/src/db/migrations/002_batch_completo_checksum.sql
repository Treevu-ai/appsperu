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
-- Hallazgo de CodeRabbit (segunda vuelta): el UPDATE de abajo marcaba
-- `completo = true` en TODO batch preexistente, incluyendo uno que se
-- hubiera interrumpido a mitad de camino (record_count correcto pero menos
-- filas insertadas de las que dice) -- justo el caso que esta migracion
-- existe para distinguir. Restringido a los batches cuyo conteo real de
-- filas en padron_electoral_2026 coincide con record_count.
ALTER TABLE raw_reniec_batches ADD COLUMN IF NOT EXISTS completo BOOLEAN NOT NULL DEFAULT false;
UPDATE raw_reniec_batches b SET completo = true
 WHERE NOT b.completo
   AND b.record_count = (
     SELECT count(*)
     FROM padron_electoral_2026 p
     WHERE p.source_batch_id = b.id
   );

-- Si ya existieran checksums duplicados (de pruebas anteriores a esta
-- migracion), el UNIQUE de abajo fallaria con un error críptico. Falla
-- fuerte y explícito en su lugar -- deduplicar manualmente es una decisión
-- de negocio (cuál de los duplicados conservar), no algo para automatizar
-- a ciegas en una migración.
DO $$
DECLARE
  duplicados INT;
BEGIN
  SELECT count(*) INTO duplicados FROM (
    SELECT checksum FROM raw_reniec_batches GROUP BY checksum HAVING count(*) > 1
  ) t;
  IF duplicados > 0 THEN
    RAISE EXCEPTION 'raw_reniec_batches tiene % checksum(s) duplicado(s) -- deduplicar manualmente antes de aplicar esta migración', duplicados;
  END IF;
END $$;

ALTER TABLE raw_reniec_batches ADD CONSTRAINT raw_reniec_batches_checksum_key UNIQUE (checksum);
