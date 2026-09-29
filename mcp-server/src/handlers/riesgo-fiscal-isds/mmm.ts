import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Handler para `riesgo_fiscal_isds_ediciones` — GET /api/mmm/ediciones.
 * SQL idéntico al de `apps/riesgo-fiscal-isds/api/src/routes/mmm.ts`.
 */
export async function ediciones(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(
    `SELECT edicion, tipo_documento, fecha_publicacion, fuente_url,
            fecha_verificacion, estado, notas
     FROM mmm_ediciones
     ORDER BY edicion`
  );

  return {
    status: 200,
    body: {
      ediciones: rows.map((r) => ({
        edicion: r.edicion,
        tipoDocumento: r.tipo_documento,
        fechaPublicacion: r.fecha_publicacion,
        fuenteUrl: r.fuente_url,
        fechaVerificacion: r.fecha_verificacion,
        estado: r.estado,
        notas: r.notas,
      })),
    },
  };
}

/**
 * Handler para `riesgo_fiscal_isds_pasivos_contingentes` — GET /api/mmm/pasivos-contingentes.
 * SQL idéntico al de `apps/riesgo-fiscal-isds/api/src/routes/mmm.ts`.
 */
export async function pasivosContingentes(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(
    `SELECT p.anio_cierre, p.categoria, p.pct_pbi, p.notas AS notas_categoria,
            p.edicion_fuente, e.fuente_url, e.fecha_verificacion
     FROM mmm_pasivos_contingentes p
     JOIN mmm_ediciones e ON e.edicion = p.edicion_fuente
     ORDER BY p.anio_cierre, p.categoria`
  );

  return {
    status: 200,
    body: {
      pasivosContingentes: rows.map((r) => ({
        anioCierre: r.anio_cierre,
        categoria: r.categoria,
        pctPbi: r.pct_pbi === null ? null : Number(r.pct_pbi),
        notas: r.notas_categoria,
        edicionFuente: r.edicion_fuente,
        fuenteUrl: r.fuente_url,
        fechaVerificacion: r.fecha_verificacion,
      })),
    },
  };
}

/**
 * Handler para `riesgo_fiscal_isds_serie_historica` — GET /api/mmm/serie-historica.
 * SQL idéntico al de `apps/riesgo-fiscal-isds/api/src/routes/mmm.ts`.
 */
export async function serieHistorica(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(
    `SELECT anio, pct_pbi, monto_usd, n_casos, fuente_url, notas
     FROM mmm_serie_historica_secundaria
     ORDER BY anio`
  );

  return {
    status: 200,
    body: {
      fuente: "secundaria",
      aclaracion:
        "Serie citada por una declaración pública (Luis Miguel Castilla, ex-MEF, PERUMIN 37, sept-2025), no una cita directa del documento MMM — no comparar sin ajuste contra pasivos-contingentes.",
      serie: rows.map((r) => ({
        anio: r.anio,
        pctPbi: Number(r.pct_pbi),
        montoUsd: r.monto_usd,
        nCasos: r.n_casos,
        fuenteUrl: r.fuente_url,
        notas: r.notas,
      })),
    },
  };
}

/**
 * Handler para `riesgo_fiscal_isds_meta_sources` — GET /api/mmm/meta/sources.
 * SQL idéntico al de `apps/riesgo-fiscal-isds/api/src/routes/mmm.ts`.
 */
export async function metaSources(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(
    `SELECT id AS batch_id, edicion, file_name, checksum, filas_insertadas, ingested_at
     FROM raw_mmm_batches
     ORDER BY ingested_at DESC
     LIMIT 10`
  );

  return {
    status: 200,
    body: {
      fuentes: [
        {
          dataset: "MEF - Pasivos contingentes explícitos del SPNF (MMM/IAPM)",
          metodo: "Ingesta manual: pdf-parse sobre PDF descargado a mano (npm run ingest:pdf)",
          ultimosLotes: rows.map((r) => ({
            batchId: r.batch_id,
            edicion: r.edicion,
            fileName: r.file_name,
            checksum: r.checksum,
            filasInsertadas: r.filas_insertadas,
            ingestadoEl: r.ingested_at,
          })),
        },
      ],
    },
  };
}
