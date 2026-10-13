import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const sancionesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface SancionRow {
  fecha_corte: string | null;
  anio_superv: number | null;
  titular: string;
  titulo: string | null;
  modalidad: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  rd_termino: string | null;
  infracciones: string | null;
  num_resodirec_rr: string | null;
  num_resodirec_tffs: string | null;
  caducidad: boolean | null;
  sancion: string | null;
  monto_multa_uit: number | string | null;
  area_otorgada_ha: number | string | null;
}

function toApiShape(r: SancionRow) {
  return {
    fechaCorte: r.fecha_corte,
    anioSuperv: r.anio_superv,
    titular: r.titular,
    titulo: r.titulo,
    modalidad: r.modalidad,
    ubigeo: r.ubigeo,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    rdTermino: r.rd_termino,
    infracciones: r.infracciones,
    numResodirecRr: r.num_resodirec_rr,
    numResodirecTffs: r.num_resodirec_tffs,
    caducidad: r.caducidad,
    sancion: r.sancion,
    montoMultaUit: r.monto_multa_uit === null ? null : Number(r.monto_multa_uit),
    areaOtorgadaHa: r.area_otorgada_ha === null ? null : Number(r.area_otorgada_ha),
  };
}

const SancionesQuerySchema = z.object({
  titular: z.string().min(1).optional(),
  titulo: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  sancion: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Sanciones a títulos habilitantes forestales supervisados por OSINFOR (2004-2026). */
sancionesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SancionesQuerySchema, req.query, res);
    if (!parsed) return;
    const { titular, titulo, departamento, sancion, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (titular) {
      params.push(`%${titular}%`);
      conditions.push(`titular ILIKE $${params.length}`);
    }
    if (titulo) {
      params.push(titulo);
      conditions.push(`titulo = $${params.length}`);
    }
    if (departamento) {
      params.push(`%${departamento}%`);
      conditions.push(`departamento ILIKE $${params.length}`);
    }
    if (sancion) {
      params.push(`%${sancion}%`);
      conditions.push(`sancion ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM sanciones_osinfor ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<SancionRow>(
      `SELECT fecha_corte, anio_superv, titular, titulo, modalidad, ubigeo,
              departamento, provincia, distrito, rd_termino, infracciones,
              num_resodirec_rr, num_resodirec_tffs, caducidad, sancion,
              monto_multa_uit, area_otorgada_ha
       FROM sanciones_osinfor
       ${where}
       ORDER BY fecha_corte DESC, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "OSINFOR - Sanciones a títulos habilitantes forestales" },
    });
  })
);
