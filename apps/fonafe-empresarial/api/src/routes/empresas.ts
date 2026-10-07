import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const empresasRouter = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface EmpresaRow {
  id: number;
  slug: string;
  codigo_interno: string;
  razon_social: string | null;
  sector: string | null;
}

function toApiShape(r: EmpresaRow) {
  return {
    id: r.id,
    slug: r.slug,
    codigoInterno: r.codigo_interno,
    razonSocial: r.razon_social,
    sector: r.sector,
  };
}

const EmpresasQuerySchema = z.object({
  sector: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Listado de empresas bajo el ámbito de FONAFE. */
empresasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(EmpresasQuerySchema, req.query, res);
    if (!parsed) return;
    const { sector, slug, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (sector) {
      params.push(`%${sector}%`);
      conditions.push(`sector ILIKE $${params.length}`);
    }
    if (slug) {
      params.push(slug);
      conditions.push(`slug = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM empresas_fonafe ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<EmpresaRow>(
      `SELECT id, slug, codigo_interno, razon_social, sector
       FROM empresas_fonafe
       ${where}
       ORDER BY sector, razon_social
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "FONAFE - Empresas de la Corporación" },
    });
  })
);
