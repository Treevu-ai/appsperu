import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const mmmRouter = Router();

mmmRouter.get(
  "/ediciones",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT edicion, tipo_documento, fecha_publicacion, fuente_url,
              fecha_verificacion, estado, notas
       FROM mmm_ediciones
       ORDER BY edicion`
    );

    res.json({
      ediciones: rows.map((r) => ({
        edicion: r.edicion,
        tipoDocumento: r.tipo_documento,
        fechaPublicacion: r.fecha_publicacion,
        fuenteUrl: r.fuente_url,
        fechaVerificacion: r.fecha_verificacion,
        estado: r.estado,
        notas: r.notas,
      })),
    });
  })
);

mmmRouter.get(
  "/pasivos-contingentes",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT p.anio_cierre, p.categoria, p.pct_pbi, p.notas AS notas_categoria,
              p.edicion_fuente, e.fuente_url, e.fecha_verificacion
       FROM mmm_pasivos_contingentes p
       JOIN mmm_ediciones e ON e.edicion = p.edicion_fuente
       ORDER BY p.anio_cierre, p.categoria`
    );

    res.json({
      pasivosContingentes: rows.map((r) => ({
        anioCierre: r.anio_cierre,
        categoria: r.categoria,
        pctPbi: r.pct_pbi === null ? null : Number(r.pct_pbi),
        notas: r.notas_categoria,
        edicionFuente: r.edicion_fuente,
        fuenteUrl: r.fuente_url,
        fechaVerificacion: r.fecha_verificacion,
      })),
    });
  })
);

mmmRouter.get(
  "/serie-historica",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT anio, pct_pbi, monto_usd, n_casos, fuente_url, notas
       FROM mmm_serie_historica_secundaria
       ORDER BY anio`
    );

    res.json({
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
    });
  })
);

mmmRouter.get(
  "/meta/sources",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id AS batch_id, edicion, file_name, checksum, filas_insertadas, ingested_at
       FROM raw_mmm_batches
       ORDER BY ingested_at DESC
       LIMIT 10`
    );

    res.json({
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
    });
  })
);
