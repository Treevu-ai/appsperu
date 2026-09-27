import { pool } from "../db/pool.js";
import { RiesgoEUDRQuery, type RiesgoEUDRData } from "../schema/riesgo-eudr.js";

/**
 * Se lanza cuando la consulta no pudo ejecutarse. La razón para que sea un
 * error y no `[]` es que este cruce todavía no tiene fuente real detrás
 * (`minam_deforestacion` no existe en ninguna base), y un `catch` que devuelve
 * `[]` convierte "no pude preguntar" en "no encontré riesgo forestal" ? la
 * conclusión opuesta. Para un agente que consulta esto para decidir si un
 * titular cumple EUDR, esa diferencia separa "puede proceder" de "tiene que
 * descartar el caso".
 */
export const RIESGO_EUDR_NO_DISPONIBLE = "RIESGO_EUDR_NO_DISPONIBLE";

export class RiesgoEUDRNoDisponibleError extends Error {
  readonly code = RIESGO_EUDR_NO_DISPONIBLE;

  constructor(cause: unknown) {
    super(
      "No se pudo consultar la fuente de riesgo EUDR. La consulta falló o la " +
        "capa de deforestación no está disponible; esto NO significa que no exista riesgo."
    );
    this.cause = cause;
  }
}

export async function getRiesgoEUDR(query: RiesgoEUDRQuery): Promise<RiesgoEUDRData[]> {
  const { ruc, departamento } = query;

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (ruc) {
    params.push(ruc);
    whereClause += ` AND f.titular_ruc = \$${params.length}`;
  }

  if (departamento) {
    params.push(departamento);
    whereClause += ` AND f.departamento = \$${params.length}`;
  }

  // conceptual query joining forest titles with MINAM deforestation data
  // Note: minam_deforestacion table needs to be created via new connector
  const sql = `
    SELECT
      f.titular_ruc as ruc,
      f.titular_nombre as nombre,
      CASE
        WHEN d.superficie_deforestada IS NULL THEN "NO_EVALUABLE"
        WHEN d.superficie_deforestada > 100 THEN "ALTO"
        WHEN d.superficie_deforestada > 0 THEN "MEDIO"
        ELSE "BAJO"
      END as estado_riesgo,
      d.superficie_deforestada,
      "Cruce entre Catastro Forestal y Capas de Deforestación MINAM" as evidencia
    FROM catastro_forestal_titulos f
    LEFT JOIN minam_deforestacion d ON f.ubicacion_geo = d.ubicacion_geo
    ${whereClause}
    LIMIT 100
  `;

  let rows: any[];
  try {
    ({ rows } = await pool.query(sql, params));
  } catch (e) {
    // Se propaga en vez de degradarse a lista vacía ? ver la nota de arriba.
    // Se propaga en vez de degradarse a lista vacía ? ver la nota de arriba.
    throw new RiesgoEUDRNoDisponibleError(e);
  }

  return rows.map((r) => ({
    ruc: r.ruc,
    nombre: r.nombre,
    estadoRiesgo: r.estado_riesgo,
    // `Number(null)` es 0, no null: sin este cuidado, un titular sin capa de
    // deforestación salía como "0 hectáreas, riesgo BAJO". Una fila sin dato
    // tiene que seguir sin dato.
    // `Number(null)` es 0, no null: sin este cuidado, un titular sin capa de
    // deforestación salía como "0 hectáreas, riesgo BAJO". Una fila sin dato
    // tiene que seguir sin dato.
    superficieDeforestada:
      r.superficie_deforestada === null || r.superficie_deforestada === undefined
        ? null
        : Number(r.superficie_deforestada),
    evidencia: r.evidencia,
  }));
}
