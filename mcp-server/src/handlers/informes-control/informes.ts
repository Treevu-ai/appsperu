import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface InformeRow extends NeonRow {
  codigo_informe: string;
  numero_informe: string;
  entidad: string;
  sector: string;
  nivel_gobierno: string;
  departamento: string;
  provincia: string;
  distrito: string;
  descripcion: string;
  modalidad_servicio: string;
  servicio_control: string;
  tipo_informe: string;
  periodo: number;
  fecha_emision: string | null;
  fecha_publicacion: string | null;
  es_con_responsabilidad: boolean;
  total_recomendaciones: number | null;
  es_covid: boolean;
  es_reconstruccion: boolean;
  url_resumen_ejecutivo: string | null;
  url_informe_completo: string | null;
  updated_at: string;
}

/**
 * Handler para `informes_control_informes` — GET /api/informes.
 * Origen: apps/informes-control/api/src/routes/informes.ts. SQL idéntico.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const entidad = args.entidad as string | undefined;
  const departamento = args.departamento as string | undefined;
  const periodo = args.periodo as string | undefined;
  const esConResponsabilidad = args.esConResponsabilidad as string | undefined;
  const limit = args.limit ? Number(args.limit) : 1000;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entidad) {
    params.push(`%${entidad.toUpperCase()}%`);
    conditions.push(`entidad ILIKE $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (periodo) {
    params.push(Number(periodo));
    conditions.push(`periodo = $${params.length}`);
  }
  if (esConResponsabilidad) {
    params.push(esConResponsabilidad === "true");
    conditions.push(`es_con_responsabilidad = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM informes_control ${where}`, params);
  const total = Number(countRows[0].total);

  const { rows } = await db.query<InformeRow>(
    `SELECT codigo_informe, numero_informe, entidad, sector, nivel_gobierno, departamento, provincia, distrito,
            descripcion, modalidad_servicio, servicio_control, tipo_informe, periodo, fecha_emision,
            fecha_publicacion, es_con_responsabilidad, total_recomendaciones, es_covid, es_reconstruccion,
            url_resumen_ejecutivo, url_informe_completo, updated_at
     FROM informes_control
     ${where}
     ORDER BY fecha_publicacion DESC NULLS LAST
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      cobertura:
        "Contraloría (buscadorinformes.contraloria.gob.pe), nacional. `esConResponsabilidad` es un indicador booleano — este endpoint nunca expone nombres de funcionarios ni detalle de responsabilidad individual, por diseño.",
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigoInforme: r.codigo_informe,
        numeroInforme: r.numero_informe,
        entidad: r.entidad,
        sector: r.sector,
        nivelGobierno: r.nivel_gobierno,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        descripcion: r.descripcion,
        modalidadServicio: r.modalidad_servicio,
        servicioControl: r.servicio_control,
        tipoInforme: r.tipo_informe,
        periodo: r.periodo,
        fechaEmision: r.fecha_emision,
        fechaPublicacion: r.fecha_publicacion,
        esConResponsabilidad: r.es_con_responsabilidad,
        totalRecomendaciones: r.total_recomendaciones,
        esCovid: r.es_covid,
        esReconstruccion: r.es_reconstruccion,
        urlResumenEjecutivo: r.url_resumen_ejecutivo,
        urlInformeCompleto: r.url_informe_completo,
        actualizadoEl: r.updated_at,
      })),
    },
  };
}
