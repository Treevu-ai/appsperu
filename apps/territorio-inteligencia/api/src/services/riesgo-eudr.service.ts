import { pool } from "../db/pool.js";
import { RiesgoEUDRQuery, type RiesgoEUDRData } from "../schema/riesgo-eudr.js";

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

  try {
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      ruc: r.ruc,
      nombre: r.nombre,
      estadoRiesgo: r.estado_riesgo,
      superficieDeforestada: Number(r.superficie_deforestada),
      evidencia: r.evidencia,
    }));
  } catch (e) {
    console.error("Error querying EUDR data (likely table minam_deforestacion missing):", e);
    return [];
  }
}
