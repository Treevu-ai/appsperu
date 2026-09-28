import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PersonalRow extends NeonRow {
  pliego: string;
  unidad_ejecutora: string;
  ejercicio: number;
  mes: number;
  desc_regimen_laboral: string;
  desc_grupo_ocupacional: string;
  desc_condicion_laboral: string;
  cantidad_total: number | string;
  costo_total_anual: number | string | null;
}

/**
 * Handler para `radar_ejecucion_personal` — GET /api/personal.
 *
 * Sin ubigeo en la fuente — filtra por texto sobre PLIEGO/UNIDAD_EJECUTORA
 * (ej. "LA LIBERTAD", "TRUJILLO", "MUNICIPALIDAD DISTRITAL DE ...").
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const entidad = args.entidad as string | undefined;
  const ejercicio = args.ejercicio as string | undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entidad) {
    params.push(`%${entidad}%`);
    conditions.push(`(pliego ILIKE $${params.length} OR unidad_ejecutora ILIKE $${params.length})`);
  }
  if (ejercicio) {
    params.push(Number(ejercicio));
    conditions.push(`ejercicio = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<PersonalRow>(
    `SELECT pliego, unidad_ejecutora, ejercicio, mes,
            desc_regimen_laboral, desc_grupo_ocupacional, desc_condicion_laboral,
            sum(cantidad) AS cantidad_total, sum(costo_total_anual) AS costo_total_anual
     FROM airhsp_personal
     ${where}
     GROUP BY pliego, unidad_ejecutora, ejercicio, mes, desc_regimen_laboral, desc_grupo_ocupacional, desc_condicion_laboral
     ORDER BY ejercicio DESC, mes DESC, cantidad_total DESC
     LIMIT 500`,
    params
  );

  return {
    status: 200,
    body: {
      filtros: { entidad, ejercicio: ejercicio ? Number(ejercicio) : null },
      registros: rows.map((r) => ({
        pliego: r.pliego,
        unidadEjecutora: r.unidad_ejecutora,
        ejercicio: r.ejercicio,
        mes: r.mes,
        regimenLaboral: r.desc_regimen_laboral,
        grupoOcupacional: r.desc_grupo_ocupacional,
        condicionLaboral: r.desc_condicion_laboral,
        cantidadTotal: Number(r.cantidad_total),
        costoTotalAnual: r.costo_total_anual === null ? null : Number(r.costo_total_anual),
      })),
      fuente: { dataset: "MEF — AIRHSP (Plataforma Nacional de Datos Abiertos)", agregacion: "por Unidad Ejecutora/régimen/cargo, no personal identificable" },
    },
  };
}