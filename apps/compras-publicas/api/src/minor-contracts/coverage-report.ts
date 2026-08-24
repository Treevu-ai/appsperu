import { pool } from "../db/pool.js";

const year = process.env.MINOR_CONTRACT_YEAR ? Number(process.env.MINOR_CONTRACT_YEAR) : 2026;
// Referencia territorial publicada por MEF para La Libertad (84 distritos,
// incluido Alto Trujillo). Es un denominador de cobertura, no una afirmación
// sobre cuántas entidades debieron registrar contratos en SEACE.
const LA_LIBERTAD_EXPECTED_DISTRICTS = 84;

if (!Number.isInteger(year) || year < 2020 || year > 2100) {
  throw new Error("MINOR_CONTRACT_YEAR debe ser un año válido.");
}

try {
  const [source, materialized, legacyCollection, bySource, byEntityType] = await Promise.all([
    pool.query(
      `SELECT id,fetched_at,record_count,
              COALESCE((payload->'pageable'->>'totalElements')::integer, record_count) AS total_elements,
              COALESCE((payload->'pageable'->>'pageSize')::integer, record_count) AS page_size
         FROM raw_minor_contract_batches
        WHERE source_system=$1 AND source_url LIKE '%/buscador?%'
          AND year=$2
        ORDER BY id DESC LIMIT 1`,
      ["OECE SEACE buscador público (interfaz no documentada)", year],
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS contracts,
              COUNT(DISTINCT c.municipality_id)::integer AS entities,
              COUNT(DISTINCT c.winning_supplier_id)::integer AS suppliers,
              COUNT(DISTINCT (c.execution_province, c.execution_district)) FILTER (WHERE c.execution_department='LA LIBERTAD' AND c.execution_province IS NOT NULL AND c.execution_district IS NOT NULL)::integer AS territorial_districts,
              COUNT(*) FILTER (WHERE c.execution_department IS DISTINCT FROM 'LA LIBERTAD')::integer AS contracts_outside_declared_department,
              COALESCE(SUM(c.awarded_amount), 0) AS total_amount,
              MIN(c.publication_date) AS first_publication,
              MAX(c.publication_date) AS last_publication
         FROM minor_contracts c
         JOIN municipalities e ON e.municipality_id=c.municipality_id
        WHERE e.department='LA LIBERTAD' AND c.year=$1`,
      [year],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT payload->'entity'->>'ruc')::integer AS entity_rucs_queried,
              COUNT(DISTINCT page_from)::integer AS months_queried,
              COUNT(DISTINCT (payload->'entity'->>'ruc', page_from))::integer AS entity_months_queried,
              COUNT(*) FILTER (WHERE record_count=0)::integer AS entity_months_without_orders,
              COUNT(*)::integer AS raw_batches,
              (SELECT COUNT(*)::integer FROM raw_minor_contract_artifacts a
                JOIN raw_minor_contract_batches b ON b.id=a.minor_source_batch_id
               WHERE b.source_system=$1 AND b.year=$2) AS artifacts
         FROM raw_minor_contract_batches
        WHERE source_system=$1 AND year=$2`,
      ["OECE SEACE órdenes históricas (interfaz pública observada)", year],
    ),
    pool.query(
      `SELECT CASE WHEN c.data_version='oece-seace-legacy-orders-v1' THEN 'SEACE_LEGACY_ENTITY_RUC' ELSE 'SEACE_PUBLIC_INTERFACE' END AS source,
              COUNT(*)::integer AS contracts, COALESCE(SUM(c.awarded_amount),0) AS total_amount
         FROM minor_contracts c
         JOIN municipalities e ON e.municipality_id=c.municipality_id
        WHERE e.department='LA LIBERTAD' AND c.year=$1
        GROUP BY 1 ORDER BY 1`,
      [year],
    ),
    pool.query(
      `SELECT e.entity_type,
              COUNT(DISTINCT e.municipality_id)::integer AS entities,
              COUNT(c.contracting_id)::integer AS contracts,
              COALESCE(SUM(c.awarded_amount), 0) AS total_amount
         FROM municipalities e
         LEFT JOIN minor_contracts c ON c.municipality_id=e.municipality_id AND c.year=$1
        WHERE e.department='LA LIBERTAD'
        GROUP BY e.entity_type
        ORDER BY e.entity_type`,
      [year],
    ),
  ]);

  const materializedSummary = materialized.rows[0] ?? { territorial_districts: 0 };
  const observedDistricts = Number(materializedSummary.territorial_districts ?? 0);
  const legacySummary = legacyCollection.rows[0] ?? {};
  const entityMonthsQueried = Number(legacySummary.entity_months_queried ?? 0);
  const expectedEntityMonths = LA_LIBERTAD_EXPECTED_DISTRICTS * 8;
  console.log(JSON.stringify({
    scope: {
      department: "LA LIBERTAD",
      year,
      statement: "La cobertura es la de los registros devueltos por las fuentes públicas consultadas. Una entidad no materializada no equivale a cero contrataciones.",
    },
    latestSourceSearch: source.rows[0] ?? null,
    materialized: materializedSummary,
    territorialCoverage: {
      expectedDistricts: LA_LIBERTAD_EXPECTED_DISTRICTS,
      observedDistricts,
      missingDistricts: Math.max(0, LA_LIBERTAD_EXPECTED_DISTRICTS - observedDistricts),
      status: observedDistricts === LA_LIBERTAD_EXPECTED_DISTRICTS ? "COMPLETE_IN_DECLARED_LOCATIONS" : "INCOMPLETE",
      limitation: "Este indicador cuenta distritos con al menos una orden menor a 8 UIT materializada; no mide si fueron consultados ni permite leer una ausencia como cero actividad.",
    },
    legacyEntityRucCollection: {
      expectedEntities: LA_LIBERTAD_EXPECTED_DISTRICTS,
      expectedEntityMonths,
      entityRucsQueried: Number(legacySummary.entity_rucs_queried ?? 0),
      monthsQueried: Number(legacySummary.months_queried ?? 0),
      entityMonthsQueried,
      entityMonthsWithoutOrders: Number(legacySummary.entity_months_without_orders ?? 0),
      rawBatches: Number(legacySummary.raw_batches ?? 0),
      artifacts: Number(legacySummary.artifacts ?? 0),
      status: entityMonthsQueried === expectedEntityMonths ? "COMPLETE_FOR_CONFIGURED_ENTITY_MONTHS" : "INCOMPLETE",
      limitation: "Una consulta sin órdenes o sin órdenes <=8 UIT es evidencia de respuesta de la fuente, no una inferencia de cero contratación total.",
    },
    byContractingEntityType: byEntityType.rows,
    bySource: bySource.rows,
    sourceCombination: {
      status: "NOT_CROSS_SOURCE_DEDUPLICATED",
      limitation: "Las dos fuentes se reportan separadas. No se suman como universo único hasta contar con una llave verificable de equivalencia entre el contrato menor nuevo y la orden histórica.",
    },
  }, null, 2));
} finally {
  await pool.end();
}
