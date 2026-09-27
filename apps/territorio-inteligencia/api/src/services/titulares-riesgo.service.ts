import { pool } from "../db/pool.js";
import { TitularesRiesgoQuery, type TitularRiesgo } from "../schema/titulares-riesgo.js";

export async function getTitularesConRiesgo(query: TitularesRiesgoQuery): Promise<TitularRiesgo[]> {
  const { ruc, departamento, soloVigentes } = query;

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (ruc) {
    params.push(ruc);
    whereClause += ` AND (m.titular = \$${params.length} OR f.titular_ruc = \$${params.length})`;
  }

  if (departamento) {
    params.push(departamento);
    whereClause += ` AND (m.departamento = \$${params.length} OR f.departamento = \$${params.length})`;
  }

  const sql = `
    SELECT 
      COALESCE(f.titular_ruc, m.titular) as ruc,
      COALESCE(f.titular_nombre, m.titular) as nombre,
      CASE WHEN m.id IS NOT NULL THEN "minero" ELSE "forestal" END as tipo_catastro,
      COALESCE(m.codigou, f.codigo_concesion) as codigo_concesion,
      COALESCE(m.hectareas, f.superficie) as superficie,
      COALESCE(m.departamento || " - " || m.provincia || " - " || m.distrito, f.departamento || " - " || f.provincia || " - " || f.distrito) as ubicacion
    FROM catastro_minero_derechos m
    FULL OUTER JOIN catastro_forestal_titulos f ON m.titular = f.titular_nombre
    ${whereClause}
    AND (
      EXISTS (SELECT 1 FROM inhabilitaciones i WHERE (i.ruc = f.titular_ruc OR i.ruc = m.titular) ${soloVigentes ? "AND i.estado ILIKE '%VIGENTE%'" : ""})
      OR EXISTS (SELECT 1 FROM inhabilitaciones_judiciales ij WHERE (ij.ruc = f.titular_ruc OR ij.ruc = m.titular))
      OR EXISTS (SELECT 1 FROM multas mu WHERE (mu.ruc = f.titular_ruc OR mu.ruc = m.titular))
    )
  `;

  const { rows: titulares } = await pool.query(sql, params);

  const results: TitularRiesgo[] = [];

  for (const t of titulares) {
    const idValue = t.ruc;
    const riesgos: any[] = [];

    const { rows: inhabs } = await pool.query(
      `SELECT resolucion, desde, hasta, estado, "descripción" as descripcion FROM inhabilitaciones WHERE ruc = \$1`, 
      [idValue]
    );
    inhabs.forEach(i => riesgos.push({ tipo: "inhabilitacion", ...i }));

    const { rows: juds } = await pool.query(
      `SELECT resolucion, desde, hasta, estado, "descripción" as descripcion FROM inhabilitaciones_judiciales WHERE ruc = \$1`, 
      [idValue]
    );
    juds.forEach(j => riesgos.push({ tipo: "judicial", ...j }));

    const { rows: multas } = await pool.query(
      `SELECT resolucion, desde, hasta, estado, "descripción" as descripcion FROM multas WHERE ruc = \$1`, 
      [idValue]
    );
    multas.forEach(m => riesgos.push({ tipo: "multa", ...m }));

    results.push({
      ruc: t.ruc,
      nombre: t.nombre,
      tipoCatastro: t.tipo_catastro,
      codigoConcesion: t.codigo_concesion,
      superficie: t.superficie,
      ubicacion: t.ubicacion,
      riesgos,
    });
  }

  return results;
}
