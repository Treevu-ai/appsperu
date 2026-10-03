import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { identidadFiscalPool } from "../db/identidad-fiscal-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const salasAutorizadasRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ruc: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

salasAutorizadasRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, ruc, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`departamento = $${params.length}`);
    }
    if (ruc) {
      params.push(ruc);
      conditions.push(`ruc = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM salas_autorizadas ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT codigo_sala, ruc, empresa, establecimiento, giro, resolucion, fecha_vigencia,
              direccion, distrito, provincia, departamento, fecha_corte
       FROM salas_autorizadas ${where}
       ORDER BY departamento NULLS LAST, empresa
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        codigoSala: r.codigo_sala,
        ruc: r.ruc,
        empresa: r.empresa,
        establecimiento: r.establecimiento,
        giro: r.giro,
        resolucion: r.resolucion,
        fechaVigencia: r.fecha_vigencia,
        direccion: r.direccion,
        distrito: r.distrito,
        provincia: r.provincia,
        departamento: r.departamento,
        fechaCorte: r.fecha_corte,
      })),
    });
  })
);

interface SunatRow {
  ruc: string;
  razon_social: string;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
}

/**
 * Cruce por RUC contra el Padrón RUC nacional (`identidad-fiscal`): detecta
 * operadores de sala de juego cuyo RUC no está ACTIVO+HABIDO en SUNAT --
 * incluye BAJA DEFINITIVA (empresa legalmente inexistente) y NO HABIDO/NO
 * HALLADO (domicilio fiscal no verificable, señal clásica de fachada). No
 * implica por sí solo una irregularidad ante MINCETUR -- el corte de la
 * fuente MINCETUR puede tener rezago frente al estado SUNAT más reciente --
 * pero es una señal verificable y concreta para investigar caso por caso.
 */
salasAutorizadasRouter.get(
  "/irregulares-sunat",
  asyncHandler(async (_req, res) => {
    const { rows: salasRows } = await pool.query<{ ruc: string }>(
      `SELECT DISTINCT ruc FROM salas_autorizadas`
    );
    const rucs = salasRows.map((r) => r.ruc);
    if (rucs.length === 0) {
      res.json({ total: 0, resultados: [] });
      return;
    }

    const { rows: sunatRows } = await identidadFiscalPool.query<SunatRow>(
      `SELECT ruc, razon_social, estado_contribuyente, condicion_domicilio
       FROM contribuyentes
       WHERE ruc = ANY($1)
         AND (estado_contribuyente IS DISTINCT FROM 'ACTIVO' OR condicion_domicilio IS DISTINCT FROM 'HABIDO')`,
      [rucs]
    );

    const sunatPorRuc = new Map(sunatRows.map((r) => [r.ruc, r]));

    const { rows: detalleRows } = await pool.query(
      `SELECT codigo_sala, ruc, empresa, establecimiento, direccion, distrito, provincia, departamento, fecha_vigencia
       FROM salas_autorizadas
       WHERE ruc = ANY($1)
       ORDER BY ruc, codigo_sala`,
      [[...sunatPorRuc.keys()]]
    );

    const resultados = detalleRows.map((r) => {
      const sunat = sunatPorRuc.get(r.ruc);
      return {
        codigoSala: r.codigo_sala,
        ruc: r.ruc,
        empresaMincetur: r.empresa,
        razonSocialSunat: sunat?.razon_social ?? null,
        establecimiento: r.establecimiento,
        direccion: r.direccion,
        distrito: r.distrito,
        provincia: r.provincia,
        departamento: r.departamento,
        fechaVigencia: r.fecha_vigencia,
        estadoContribuyente: sunat?.estado_contribuyente ?? null,
        condicionDomicilio: sunat?.condicion_domicilio ?? null,
      };
    });

    res.json({
      total: resultados.length,
      resultados,
      nota:
        "Operadores de sala de juego autorizada cuyo RUC no figura ACTIVO+HABIDO en el Padrón " +
        "RUC de SUNAT (identidad-fiscal). Incluye BAJA DEFINITIVA (empresa legalmente inexistente) " +
        "y NO HABIDO/NO HALLADO (domicilio fiscal no verificable). No implica automáticamente una " +
        "irregularidad ante MINCETUR -- revisar caso por caso contra la fuente primaria.",
    });
  })
);
