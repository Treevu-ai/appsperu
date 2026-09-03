import { pool } from "../db/pool.js";
import { ingestConformacionForRucs } from "./perfilprov-conformacion-connector.js";

/**
 * Corre la conformación societaria para todos los RUCs de 11 dígitos ya
 * conocidos en supplier_profiles y municipalities (los proveedores/entidades
 * que ya identificamos en compras-publicas). Ignora IDs sintéticos de
 * consorcio (PE-RUC-<7 dígitos>, sin RUC real) — esos ya sabemos que no
 * traen socios.
 */
async function main(): Promise<void> {
  const departamentoFilter = process.argv[2];

  // supplier_profiles (contrataciones menores) y awards (procesos grandes) se
  // pueblan por separado y no se solapan — hay que unir RUCs de ambas fuentes.
  const { rows } = await pool.query<{ ruc: string }>(
    `SELECT DISTINCT ruc FROM (
       SELECT ruc FROM supplier_profiles
       WHERE ruc IS NOT NULL AND ruc ~ '^\\d{11}$'
         ${departamentoFilter ? "AND supplier_id IN (SELECT DISTINCT winning_supplier_id FROM minor_contracts mc JOIN municipalities m ON m.municipality_id = mc.municipality_id WHERE m.department = $1)" : ""}
       UNION
       SELECT regexp_replace(supplier_id, '^PE-RUC-', '') AS ruc FROM awards
       WHERE supplier_id ~ '^PE-RUC-\\d{11}$'
         ${departamentoFilter ? "AND departamento = $1" : ""}
     ) x
     ORDER BY ruc`,
    departamentoFilter ? [departamentoFilter] : []
  );

  const rucs = rows.map((r) => r.ruc);
  console.log(`Consultando conformación societaria para ${rucs.length} RUCs...`);

  const results = await ingestConformacionForRucs(rucs);
  const conSocios = results.filter((r) => r.tieneSocios).length;
  const sinDatos = results.filter((r) => !r.found).length;

  console.log(JSON.stringify({
    totalRucs: rucs.length,
    conSocios,
    sinSocios: results.length - conSocios - sinDatos,
    sinDatos,
  }, null, 2));
}

main()
  .finally(() => pool.end())
  .catch((error) => {
    console.error("Ingesta de conformación falló:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
