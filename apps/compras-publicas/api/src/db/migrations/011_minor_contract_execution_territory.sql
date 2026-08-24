-- La entidad contratante y el lugar declarado del ítem no son la misma
-- dimensión: una entidad regional puede contratar para distintos distritos.
ALTER TABLE minor_contracts
  ADD COLUMN IF NOT EXISTS execution_department TEXT,
  ADD COLUMN IF NOT EXISTS execution_province TEXT,
  ADD COLUMN IF NOT EXISTS execution_district TEXT;

-- Recupera la ubicación desde el detalle SEACE crudo ya versionado. `award_id`
-- conserva el id de ítem de SEACE para que el backfill no use coincidencias de
-- texto, proveedor o monto.
UPDATE minor_contracts c
   SET execution_department = COALESCE(item.value->>'nomDistritoExt', item.value->>'nomDistrito'),
       execution_province = NULL,
       execution_district = NULL
  FROM raw_minor_contract_batches b
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.payload->'uitContratoItemProjectionList', '[]'::jsonb)) AS item(value)
 WHERE b.id=c.minor_source_batch_id
   AND item.value->>'idContratoItem'=c.award_id;

UPDATE minor_contracts
   SET execution_department = NULLIF(split_part(execution_department, '/', 1), ''),
       execution_province = NULLIF(split_part(execution_department, '/', 2), ''),
       execution_district = NULLIF(split_part(execution_department, '/', 3), '')
 WHERE execution_department IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_minor_contracts_execution_territory
  ON minor_contracts(execution_department, execution_province, execution_district, year);
