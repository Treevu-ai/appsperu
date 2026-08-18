import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

/**
 * Cruce inversiones <-> presupuesto por SEC_EJEC — a diferencia del cruce
 * con compras públicas, acá SÍ hay una clave compartida exacta entre las
 * dos fuentes, así que no hace falta matching difuso ni una tabla de
 * crosswalk persistida: se agrega en vivo por entidad y se junta en la capa
 * de aplicación.
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

  const { rows: invRows } = await pool.query(
    `SELECT sec_ejec, nombre_uep,
            COUNT(*) AS inversiones,
            SUM(monto_viable) AS monto_viable_total,
            SUM(costo_actualizado) AS costo_actualizado_total
     FROM investments
     WHERE departamento = $1 AND sec_ejec IS NOT NULL
     GROUP BY sec_ejec, nombre_uep`,
    [wantedDepartamento]
  );

  if (invRows.length === 0) {
    res.json({ resultados: [] });
    return;
  }

  const secEjecCodes = invRows.map((r) => r.sec_ejec);

  const { rows: devengadoRows } = await ejecucionPool.query(
    `SELECT b.entity_code AS entity_code, e.nombre AS nombre, SUM(b.devengado) AS devengado
     FROM budget_execution b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE b.entity_code = ANY($1)
     GROUP BY b.entity_code, e.nombre`,
    [secEjecCodes]
  );

  const devengadoByEntity = new Map(
    devengadoRows.map((r) => [r.entity_code, { nombre: r.nombre, devengado: Number(r.devengado) }])
  );

  res.json({
    resultados: invRows.map((r) => {
      const presupuesto = devengadoByEntity.get(r.sec_ejec);
      return {
        secEjec: r.sec_ejec,
        nombreUep: r.nombre_uep,
        nombreEnPresupuesto: presupuesto?.nombre ?? null,
        enPresupuesto: Boolean(presupuesto),
        inversiones: Number(r.inversiones),
        montoViableTotal: Number(r.monto_viable_total) || 0,
        costoActualizadoTotal: Number(r.costo_actualizado_total) || 0,
        devengado: presupuesto?.devengado ?? 0,
      };
    }),
  });
}));
