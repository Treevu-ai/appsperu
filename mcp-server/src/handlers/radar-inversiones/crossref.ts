import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface InvRow extends NeonRow {
  sec_ejec: string;
  nombre_uep: string | null;
  inversiones: number | string;
  monto_viable_total: number | string | null;
  costo_actualizado_total: number | string | null;
}

interface DevengadoRow extends NeonRow {
  entity_code: string;
  nombre: string;
  devengado: number | string;
  cortes: string[];
}

/**
 * Handler para `radar_inversiones_crossref` — GET /api/crossref.
 *
 * Cruce inversiones <-> presupuesto por SEC_EJEC, idéntico a
 * `apps/radar-inversiones/api/src/routes/crossref.ts`. La consulta de
 * devengado va contra la base de `radar-ejecucion` (cross-app), la de
 * inversiones contra la propia base de la app.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const { rows: invRows } = await db.query<InvRow>(
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
    return { status: 200, body: { resultados: [] } };
  }

  const secEjecCodes = invRows.map((r) => r.sec_ejec);

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const { rows: devengadoRows } = await ejecucionDb.query<DevengadoRow>(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code AS entity_code, e.nombre AS nombre, SUM(b.devengado) AS devengado,
            array_agg(DISTINCT b.fecha_corte) AS cortes
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     WHERE b.entity_code = ANY($1)
     GROUP BY b.entity_code, e.nombre`,
    [secEjecCodes]
  );

  const devengadoByEntity = new Map(
    devengadoRows.map((r) => [r.entity_code, { nombre: r.nombre, devengado: Number(r.devengado), cortes: r.cortes }])
  );

  return {
    status: 200,
    body: {
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
          coberturaTemporal: presupuesto ? { cortesUsados: presupuesto.cortes, estado: "PARCIAL" } : null,
        };
      }),
    },
  };
}
