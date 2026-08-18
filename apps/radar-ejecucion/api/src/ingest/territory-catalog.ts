import { pool } from "../db/pool.js";

export interface TerritoryRecord {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
}

/**
 * Carga (o refresca) el catálogo maestro territorial. Fuente: INEI/UBIGEO.
 * `vigenteDesde` y `fuente` quedan fijos por lote de carga, no por fila individual,
 * porque el catálogo se publica como snapshot completo, no incremental.
 */
export async function loadTerritoryCatalog(
  records: TerritoryRecord[],
  fuente: string,
  vigenteDesde: string
): Promise<number> {
  let count = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of records) {
      await client.query(
        `INSERT INTO territories (ubigeo, departamento, provincia, distrito, vigente_desde, fuente)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (ubigeo) DO UPDATE
           SET departamento = EXCLUDED.departamento,
               provincia = EXCLUDED.provincia,
               distrito = EXCLUDED.distrito,
               vigente_desde = EXCLUDED.vigente_desde,
               fuente = EXCLUDED.fuente`,
        [r.ubigeo, r.departamento, r.provincia, r.distrito, vigenteDesde, fuente]
      );
      count += 1;
    }
    await client.query("COMMIT");
    return count;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
