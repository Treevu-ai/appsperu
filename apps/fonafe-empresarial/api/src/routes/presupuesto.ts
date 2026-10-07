import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const presupuestoRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface PresupuestoRow {
  empresa_slug: string;
  razon_social: string | null;
  sector: string | null;
  anio_ejecucion: number | null;
  ultimo_mes_informado: string | null;
  rubro: string;
  presupuestado_anual: number | string | null;
  presupuesto_ultimo_mes: number | string | null;
  ejecucion_ultimo_mes: number | string | null;
}

function toNumber(v: number | string | null): number | null {
  return v === null ? null : Number(v);
}

function toApiShape(r: PresupuestoRow) {
  return {
    empresaSlug: r.empresa_slug,
    razonSocial: r.razon_social,
    sector: r.sector,
    anioEjecucion: r.anio_ejecucion,
    ultimoMesInformado: r.ultimo_mes_informado,
    rubro: r.rubro,
    presupuestadoAnual: toNumber(r.presupuestado_anual),
    presupuestoUltimoMes: toNumber(r.presupuesto_ultimo_mes),
    ejecucionUltimoMes: toNumber(r.ejecucion_ultimo_mes),
  };
}

const PresupuestoQuerySchema = z.object({
  slug: z.string().min(1).optional(),
  sector: z.string().min(1).optional(),
  anio: z.coerce.number().int().optional(),
  rubro: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Presupuesto y ejecución mensual por empresa y rubro (FONAFE). */
presupuestoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PresupuestoQuerySchema, req.query, res);
    if (!parsed) return;
    const { slug, sector, anio, rubro, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (slug) {
      params.push(slug);
      conditions.push(`e.slug = $${params.length}`);
    }
    if (sector) {
      params.push(`%${sector}%`);
      conditions.push(`e.sector ILIKE $${params.length}`);
    }
    if (anio) {
      params.push(anio);
      conditions.push(`p.anio_ejecucion = $${params.length}`);
    }
    if (rubro) {
      params.push(`%${rubro}%`);
      conditions.push(`p.rubro ILIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM presupuesto_empresarial p
       JOIN empresas_fonafe e ON e.id = p.empresa_id
       ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query<PresupuestoRow>(
      `SELECT e.slug AS empresa_slug, e.razon_social, e.sector,
              p.anio_ejecucion, p.ultimo_mes_informado, p.rubro,
              p.presupuestado_anual, p.presupuesto_ultimo_mes, p.ejecucion_ultimo_mes
       FROM presupuesto_empresarial p
       JOIN empresas_fonafe e ON e.id = p.empresa_id
       ${where}
       ORDER BY e.sector, e.razon_social, p.rubro
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: { dataset: "FONAFE - Presupuesto Empresarial" },
    });
  })
);
