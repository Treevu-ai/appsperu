import { pool } from "../db/pool.js";
import { InconsistenciaPresupuestoQuery, type InconsistenciaData } from "../schema/inconsistencia-presupuesto.js";

export async function getInconsistenciasPresupuestales(query: InconsistenciaPresupuestoQuery): Promise<InconsistenciaData[]> {
  const { departamento, sector } = query;

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (departamento) {
    params.push(departamento);
    whereClause += ` AND p.departamento = \$${params.length}`;
  }

  if (sector) {
    params.push(sector);
    whereClause += ` AND p.entidad_nombre ILIKE \$${params.length}`;
  }

  const sql = `
    SELECT 
      p.nombre as proyecto,
      p.codigo as codigoProyecto,
      p.monto as monto,
      p.departamento as ubicacion,
      (
        SELECT COUNT(*) 
        FROM inteligencia_minero m 
        JOIN catastro_forestal_titulos f ON m.titular_ruc = f.titular_ruc
        WHERE m.distrito = p.distrito AND m.provincia = p.provincia
      ) > 0 as conflictoDeteccionado
    FROM proyectos p
    ${whereClause}
    LIMIT 100
  `;

  const { rows } = await pool.query(sql, params);

  return rows.map(r => ({
    proyecto: r.proyecto,
    codigoProyecto: r.codigoproyecto,
    monto: Number(r.monto),
    ubicacion: r.ubicacion,
    conflictoDeteccionado: r.conflictodeteccionado,
    detalleConflicto: r.conflictodeteccionado ? "Se detectó superposición de concesiones mineras y forestales en el distrito del proyecto." : "Sin conflictos conocidos.",
  }));
}
