import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1),
  anio: z.string().regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos"),
});

/**
 * Cruce actividad-agraria (MIDAGRI, costo de jornal) <-> radar-ejecucion
 * (gasto en la función AGROPECUARIA), por `departamento` exacto — mismo
 * patrón de bucket exacto sin matcher difuso que usa el cruce CEPLAN
 * (ver ADR-0003 y ADR-0008). Propósito: "cuánto cuesta operar en el campo"
 * (costo de jornal) junto a "cuánto invierte el Estado en agro" en la
 * misma región y año.
 *
 * Limitación conocida (ver ADR-0006): `radar-ejecucion` hoy solo tiene
 * ingerido Gobierno Regional/Local con sede en el departamento —
 * gasto nacional dirigido a la región (`meta_departamento`, ej. programas
 * de MIDAGRI/ANIN ejecutados desde Lima) no está ingerido todavía. Este
 * cruce, por ahora, solo ve la ejecución propia de GR/GL, no el gasto
 * nacional destinado a la región.
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const anio = Number(parsed.anio);

    const { rows: wageRows } = await pool.query<{ mes: number; valor_soles: string | null }>(
      `SELECT mes, valor_soles FROM agricultural_wage WHERE departamento = $1 AND anio = $2 ORDER BY mes`,
      [departamento, anio]
    );

    const { rows: ejecucionRows } = await ejecucionPool.query<{
      pim: string;
      devengado: string;
    }>(
      `SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
       FROM budget_execution b
       JOIN entities e ON e.entity_code = b.entity_code
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE b.funcion = 'AGROPECUARIA' AND b.anio_fiscal = $1 AND t.departamento = $2`,
      [anio, departamento]
    );

    const pim = Number(ejecucionRows[0]?.pim ?? 0);
    const devengado = Number(ejecucionRows[0]?.devengado ?? 0);
    const valoresReportados = wageRows.filter((r) => r.valor_soles !== null);
    const promedioJornal =
      valoresReportados.length > 0
        ? Math.round(
            (valoresReportados.reduce((sum, r) => sum + Number(r.valor_soles), 0) / valoresReportados.length) * 100
          ) / 100
        : null;

    res.json({
      departamento,
      anio,
      jornalAgricola: {
        promedioAnualSoles: promedioJornal,
        porMes: wageRows.map((r) => ({ mes: r.mes, valorSoles: r.valor_soles !== null ? Number(r.valor_soles) : null })),
      },
      ejecucionAgropecuaria: {
        pim,
        devengado,
        avancePct: pim > 0 ? Math.round((devengado / pim) * 10000) / 100 : null,
      },
    });
  })
);
