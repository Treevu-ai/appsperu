import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const patrimonioRouter = Router();

/**
 * GET /api/patrimonio/predios?departamento=&provincia=&distrito=
 * Cobertura PARCIAL: solo predios efectivamente supervisados por SBN, no el
 * universo completo del registro SINABIP (ese dataset solo se publica vía
 * un enlace de Google Drive que está roto).
 */
patrimonioRouter.get("/predios", asyncHandler(async (req, res) => {
  const departamento = typeof req.query.departamento === "string" ? req.query.departamento : null;
  const provincia = typeof req.query.provincia === "string" ? req.query.provincia : null;
  const distrito = typeof req.query.distrito === "string" ? req.query.distrito : null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) { params.push(departamento.toUpperCase()); conditions.push(`departamento = $${params.length}`); }
  if (provincia) { params.push(provincia.toUpperCase()); conditions.push(`provincia = $${params.length}`); }
  if (distrito) { params.push(distrito.toUpperCase()); conditions.push(`distrito = $${params.length}`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT numero_informe, fecha_emision, actividad, departamento, provincia, distrito,
            cus, area_supervisada_m2, resultado_supervision, titular_predio, zona_playa_protegida
     FROM sbn_supervision_predios
     ${where}
     ORDER BY fecha_emision DESC
     LIMIT 500`,
    params
  );

  res.json({
    filtros: { departamento, provincia, distrito },
    predios: rows.map((r) => ({
      numeroInforme: r.numero_informe,
      fechaEmision: r.fecha_emision,
      actividad: r.actividad,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      cus: r.cus,
      areaSupervisadaM2: r.area_supervisada_m2 === null ? null : Number(r.area_supervisada_m2),
      resultadoSupervision: r.resultado_supervision,
      titularPredio: r.titular_predio,
      zonaPlayaProtegida: r.zona_playa_protegida,
    })),
    limitacion: "Cobertura parcial: solo predios efectivamente supervisados por SBN, no el registro completo SINABIP (ese dataset se publica solo como enlace de Google Drive, actualmente roto).",
    fuente: { dataset: "SBN — Supervisión de predios estatales (Plataforma Nacional de Datos Abiertos)" },
  });
}));
