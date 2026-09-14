import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const mmmRouter = Router();

mmmRouter.get(
  "/ediciones",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT edicion, fecha_publicacion, fuente_url, fuente_secundaria_url,
              fecha_verificacion, estado, notas
       FROM mmm_ediciones
       ORDER BY edicion`
    );

    res.json({
      ediciones: rows.map((r) => ({
        edicion: r.edicion,
        fechaPublicacion: r.fecha_publicacion,
        fuenteUrl: r.fuente_url,
        fuenteSecundariaUrl: r.fuente_secundaria_url,
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
      `SELECT e.edicion, e.fecha_publicacion, e.estado AS estado_edicion,
              p.categoria, p.pct_pbi, p.notas AS notas_categoria,
              e.fuente_url, e.fuente_secundaria_url, e.fecha_verificacion
       FROM mmm_pasivos_contingentes p
       JOIN mmm_ediciones e ON e.edicion = p.edicion
       ORDER BY e.edicion, p.categoria`
    );

    res.json({
      pasivosContingentes: rows.map((r) => ({
        edicion: r.edicion,
        fechaPublicacion: r.fecha_publicacion,
        estadoEdicion: r.estado_edicion,
        categoria: r.categoria,
        pctPbi: r.pct_pbi === null ? null : Number(r.pct_pbi),
        notas: r.notas_categoria,
        fuenteUrl: r.fuente_url,
        fuenteSecundariaUrl: r.fuente_secundaria_url,
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
