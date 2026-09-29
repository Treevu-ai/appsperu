import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CemRow extends NeonRow {
  anio_reporte: number;
  periodo: string;
  codigo_centro_atencion: string;
  nombre_centro_atencion: string;
  ubigeo: string | null;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  casos_total: number | string | null;
  casos_hombres: number | string | null;
  casos_mujeres: number | string | null;
  casos_violencia_psicologica: number | string | null;
  casos_violencia_fisica: number | string | null;
  casos_violencia_sexual: number | string | null;
  casos_violencia_economica: number | string | null;
  fetched_at: string;
}

/**
 * Handler para `mimp_cem_casos` — GET /api/cem.
 * Origen: apps/mimp/api/src/routes/cem.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`c.departamento = $${params.length}`);
  }
  if (anio) {
    params.push(anio);
    conditions.push(`c.anio_reporte = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<CemRow>(
    `SELECT c.anio_reporte, c.periodo, c.codigo_centro_atencion, c.nombre_centro_atencion,
            c.ubigeo, c.departamento, c.provincia, c.distrito, c.casos_total, c.casos_hombres,
            c.casos_mujeres, c.casos_violencia_psicologica, c.casos_violencia_fisica,
            c.casos_violencia_sexual, c.casos_violencia_economica, rb.fetched_at
     FROM cem_casos_violencia c
     JOIN raw_mimp_batches rb ON rb.id = c.source_batch_id
     ${where}
     ORDER BY c.anio_reporte DESC, c.departamento`,
    params
  );

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        anioReporte: r.anio_reporte,
        periodo: r.periodo,
        codigoCentroAtencion: r.codigo_centro_atencion,
        nombreCentroAtencion: r.nombre_centro_atencion,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        casosTotal: r.casos_total === null ? null : Number(r.casos_total),
        casosHombres: r.casos_hombres === null ? null : Number(r.casos_hombres),
        casosMujeres: r.casos_mujeres === null ? null : Number(r.casos_mujeres),
        casosViolenciaPsicologica: r.casos_violencia_psicologica === null ? null : Number(r.casos_violencia_psicologica),
        casosViolenciaFisica: r.casos_violencia_fisica === null ? null : Number(r.casos_violencia_fisica),
        casosViolenciaSexual: r.casos_violencia_sexual === null ? null : Number(r.casos_violencia_sexual),
        casosViolenciaEconomica: r.casos_violencia_economica === null ? null : Number(r.casos_violencia_economica),
        fuente: { dataset: "MIMP - Casos atendidos por violencia contra la mujer (CEM), agregado por centro", extraidoEl: r.fetched_at },
      })),
    },
  };
}
