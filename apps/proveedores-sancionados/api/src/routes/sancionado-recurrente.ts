import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const sancionadoRecurrenteRouter = Router();

const DEFAULT_MIN_RESOLUCIONES = 2;
const DEFAULT_VENTANA_DIAS = 180;

/**
 * OE-04 (docs/PRD_Observatorio_Electoral_y_Riesgo_v1.md) — señal encontrada
 * a mano el 2026-09-10 revisando `inhabilitaciones` fila por fila en el
 * cruce de Lima: Serpaem S.A.C. (4 resoluciones distintas en 2025), Mejesa
 * S.R.L. y Protektor Seguridad Integral S.A.C. (2 cada una, semanas/meses
 * de distancia). Se agrupa por RUC y se marca cuando hay `minResoluciones`
 * o más resoluciones DISTINTAS cuyo rango completo (primera a última fecha
 * `desde`) cae dentro de `ventanaDias`.
 *
 * Esto es una preselección exploratoria, no una conclusión: agrupa por
 * cercanía temporal del rango completo, no por proximidad par-a-par (un
 * caso con 3 resoluciones muy separadas entre la primera y la última, pero
 * cada una cerca de otra distinta, no calificaría) — mismo estándar de
 * "no determina un patrón de conducta" que ya usa el resto del catálogo de
 * señales (ver `compras-publicas/minor-contracts/derive-signals.ts`).
 */
const SancionadoRecurrenteQuerySchema = z.object({
  minResoluciones: z.coerce.number().int().min(2).max(20).default(DEFAULT_MIN_RESOLUCIONES),
  ventanaDias: z.coerce.number().int().min(1).max(3650).default(DEFAULT_VENTANA_DIAS),
});

interface RecurrenteRow {
  ruc: string;
  razon_social: string;
  num_resoluciones: string;
  primera_resolucion: string;
  ultima_resolucion: string;
  ventana_dias: string;
  resoluciones: { resolucion: string; estado: string | null; desde: string | null; hasta: string | null }[];
}

sancionadoRecurrenteRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SancionadoRecurrenteQuerySchema, req.query, res);
  if (!parsed) return;
  const { minResoluciones, ventanaDias } = parsed;

  const { rows } = await pool.query<RecurrenteRow>(
    `SELECT ruc, MAX(razon_social) AS razon_social,
            COUNT(DISTINCT resolucion)::text AS num_resoluciones,
            MIN(desde)::text AS primera_resolucion,
            MAX(desde)::text AS ultima_resolucion,
            (MAX(desde) - MIN(desde))::text AS ventana_dias,
            jsonb_agg(jsonb_build_object('resolucion', resolucion, 'estado', estado, 'desde', desde, 'hasta', hasta) ORDER BY desde) AS resoluciones
       FROM inhabilitaciones
      WHERE desde IS NOT NULL
      GROUP BY ruc
     HAVING COUNT(DISTINCT resolucion) >= $1 AND (MAX(desde) - MIN(desde)) <= $2
      ORDER BY COUNT(DISTINCT resolucion) DESC, (MAX(desde) - MIN(desde)) ASC`,
    [minResoluciones, ventanaDias]
  );

  res.json({
    minResoluciones,
    ventanaDias,
    resultados: rows.map((r) => ({
      ruc: r.ruc,
      razonSocial: r.razon_social,
      numResoluciones: Number(r.num_resoluciones),
      primeraResolucion: r.primera_resolucion,
      ultimaResolucion: r.ultima_resolucion,
      ventanaDiasObservada: Number(r.ventana_dias),
      resoluciones: r.resoluciones,
      explicacion:
        `${r.num_resoluciones} resoluciones de inhabilitación distintas en ${r.ventana_dias} días. ` +
        "No determina un patrón de conducta ni una conclusión — requiere revisión humana.",
    })),
  });
}));
