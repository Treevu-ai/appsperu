import { pool } from "../db/pool.js";
import { INITIAL_SECTOR_SEEDS } from "../sector/registry.js";

async function main(): Promise<void> {
  let inserted = 0;
  const notFound: string[] = [];
  for (const seed of INITIAL_SECTOR_SEEDS) {
    const result = await pool.query(
      `INSERT INTO sector_entity_registry (
         sector_id, sector_nombre, entity_code, entity_name_publicado, entity_kind,
         nivel_gobierno, scope_rule, verification_status, evidence_source, evidence_field
       )
       SELECT $1,$2,e.entity_code,e.nombre,$3,$4,$5,'VERIFICADO',
              'MEF - Presupuesto y ejecución de gasto materializado', 'entities.entity_code + entities.nombre'
         FROM entities e
        WHERE e.entity_code=$6 AND e.nombre=$7 AND e.nivel_gobierno=$4
       ON CONFLICT (sector_id, entity_code) DO NOTHING`,
      [seed.sectorId, seed.sectorNombre, seed.entityKind, seed.nivelGobierno, seed.scopeRule, seed.entityCode, seed.entityName],
    );
    inserted += result.rowCount ?? 0;
    if ((result.rowCount ?? 0) === 0) {
      const exists = await pool.query("SELECT 1 FROM entities WHERE entity_code=$1 AND nombre=$2", [seed.entityCode, seed.entityName]);
      if (exists.rowCount === 0) notFound.push(`${seed.entityCode} | ${seed.entityName}`);
    }
  }
  console.log(JSON.stringify({ attempted: INITIAL_SECTOR_SEEDS.length, inserted, notFound }, null, 2));
}

main().catch((error) => { console.error("No se pudo sembrar el registro sectorial:", error); process.exitCode = 1; }).finally(async () => pool.end());
