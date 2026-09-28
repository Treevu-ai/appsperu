import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface ProyectoRow extends NeonRow {
  entity_code: string;
  nombre: string;
  funcion: string;
  generica: string | null;
  programa_ppto_nombre: string | null;
  proyecto_nombre: string;
  anio_fiscal: number;
  devengado: number | string;
  meta_departamento: string | null;
}

/**
 * Handler para `radar_ejecucion_proyectos` — GET /api/proyectos.
 *
 * Nombre real de proyecto/actividad/obra por entidad+función — el nivel de
 * detalle que responde "qué construye" una entidad, no solo bajo qué
 * función/genérica cae. Ver ADR-0006 y `budget_execution_proyectos`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const entityCode = args.entityCode as string | undefined;
  const funcion = args.funcion as string | undefined;
  const anio = args.anio as string | undefined;
  const metaDepartamento = args.metaDepartamento as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entityCode) {
    params.push(entityCode);
    conditions.push(`p.entity_code = $${params.length}`);
  }
  if (funcion) {
    params.push(funcion);
    conditions.push(`p.funcion = $${params.length}`);
  }
  if (anio) {
    params.push(Number(anio));
    conditions.push(`p.anio_fiscal = $${params.length}`);
  }
  if (metaDepartamento) {
    params.push(metaDepartamento.toUpperCase());
    conditions.push(`p.meta_departamento = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<ProyectoRow>(
    `WITH latest_projects AS (
       SELECT DISTINCT ON (
         p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
         COALESCE(p.meta_departamento, ''), COALESCE(p.generica, '')
       ) p.*
       FROM budget_execution_proyectos p
       ORDER BY p.entity_code, p.funcion, p.anio_fiscal, p.proyecto_nombre,
                COALESCE(p.meta_departamento, ''), COALESCE(p.generica, ''),
                p.fecha_corte DESC, p.id DESC
     )
     SELECT p.entity_code, e.nombre, p.funcion, p.generica, p.programa_ppto_nombre,
            p.proyecto_nombre, p.anio_fiscal, p.devengado, p.meta_departamento
     FROM latest_projects p
     JOIN entities e ON e.entity_code = p.entity_code
     ${where}
     ORDER BY p.devengado DESC
     LIMIT 500`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        entityCode: r.entity_code,
        nombre: r.nombre,
        funcion: r.funcion,
        generica: r.generica,
        programaPptoNombre: r.programa_ppto_nombre,
        proyectoNombre: r.proyecto_nombre,
        anioFiscal: r.anio_fiscal,
        devengado: Number(r.devengado),
        metaDepartamento: r.meta_departamento,
      })),
    },
  };
}