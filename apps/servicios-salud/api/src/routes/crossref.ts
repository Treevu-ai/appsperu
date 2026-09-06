import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

/**
 * Confirmado en vivo contra `investments` (radar-inversiones) el 2026-09-05:
 * SALUD (740 filas) y SALUD Y SANEAMIENTO (26 filas) son los dos valores de
 * `funcion` relevantes para este cruce — no asumir que "SALUD" sola cubre
 * todo (mismo riesgo de fragmentación de categorías que advertía el PRD).
 * `SANEAMIENTO` a secas (1,109 filas) NO se incluye — es agua/saneamiento,
 * no salud.
 */
const FUNCIONES_SALUD = ["SALUD", "SALUD Y SANEAMIENTO"];

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ubigeo: z.string().min(1).optional(),
});

interface InvestmentAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
}

interface IpressAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  total: number;
  activos: number;
}

/**
 * Cruce inversión en salud (Invierte.pe/CUI) <-> establecimientos de salud
 * (RENIPRESS), agregado por UBIGEO exacto — sin matcher difuso, ambos lados
 * ya comparten la misma columna. Responde la pregunta que motiva todo el
 * PRD: "el gobierno invirtió en salud en mi distrito, ¿está el puesto de
 * salud operativo?"
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const departamento = (parsed.departamento ?? "LA LIBERTAD").toUpperCase().trim();
  const ubigeo = parsed.ubigeo?.trim();

  // Alcance territorial real de `investments`, consultado en vivo en cada
  // request — no un valor fijo en código. Confirmado en el spike (2026-09-05):
  // hoy es 100% LA LIBERTAD, pero el conector de radar-inversiones soporta
  // otros departamentos, así que este dato puede cambiar sin aviso.
  const { rows: coberturaRows } = await inversionesPool.query<{ departamento: string }>(
    "SELECT DISTINCT departamento FROM investments WHERE departamento IS NOT NULL ORDER BY departamento"
  );
  const departamentosConInversion = coberturaRows.map((r) => r.departamento);

  const invConditions = ["funcion = ANY($1)", "departamento = $2", "ubigeo IS NOT NULL"];
  const invParams: unknown[] = [FUNCIONES_SALUD, departamento];
  if (ubigeo) {
    invParams.push(ubigeo);
    invConditions.push(`ubigeo = $${invParams.length}`);
  }

  const { rows: invRows } = await inversionesPool.query<{
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    inversiones: string;
    monto_viable_total: string;
    costo_actualizado_total: string;
  }>(
    `SELECT ubigeo, departamento, provincia, distrito,
            COUNT(*) AS inversiones,
            COALESCE(SUM(monto_viable), 0) AS monto_viable_total,
            COALESCE(SUM(costo_actualizado), 0) AS costo_actualizado_total
     FROM investments
     WHERE ${invConditions.join(" AND ")}
     GROUP BY ubigeo, departamento, provincia, distrito`,
    invParams
  );

  const ipressConditions = ["departamento = $1", "ubigeo IS NOT NULL"];
  const ipressParams: unknown[] = [departamento];
  if (ubigeo) {
    ipressParams.push(ubigeo);
    ipressConditions.push(`ubigeo = $${ipressParams.length}`);
  }

  const { rows: ipressRows } = await pool.query<{
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    total: string;
    activos: string;
  }>(
    `SELECT ubigeo, departamento, provincia, distrito,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE estado = 'ACTIVO') AS activos
     FROM ipress
     WHERE ${ipressConditions.join(" AND ")}
     GROUP BY ubigeo, departamento, provincia, distrito`,
    ipressParams
  );

  const investmentsByUbigeo = new Map<string, InvestmentAgg>(
    invRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        inversiones: Number(r.inversiones),
        montoViableTotal: Number(r.monto_viable_total),
        costoActualizadoTotal: Number(r.costo_actualizado_total),
      },
    ])
  );
  const ipressByUbigeo = new Map<string, IpressAgg>(
    ipressRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        total: Number(r.total),
        activos: Number(r.activos),
      },
    ])
  );

  const allUbigeos = new Set([...investmentsByUbigeo.keys(), ...ipressByUbigeo.keys()]);

  const resultados = [...allUbigeos]
    .map((u) => {
      const inv = investmentsByUbigeo.get(u) ?? null;
      const ips = ipressByUbigeo.get(u) ?? null;
      return {
        ubigeo: u,
        departamento: inv?.departamento ?? ips?.departamento ?? null,
        provincia: inv?.provincia ?? ips?.provincia ?? null,
        distrito: inv?.distrito ?? ips?.distrito ?? null,
        inversionSalud: inv
          ? {
              inversiones: inv.inversiones,
              montoViableTotal: inv.montoViableTotal,
              costoActualizadoTotal: inv.costoActualizadoTotal,
            }
          : null,
        ipress: ips ? { total: ips.total, activos: ips.activos } : null,
        // "Punto ciego": hay inversión en salud registrada pero no hay ningún
        // IPRESS activo en ese distrito (ni siquiera registrado en RENIPRESS).
        puntoCiego: Boolean(inv) && (!ips || ips.activos === 0),
      };
    })
    .sort((a, b) => a.ubigeo.localeCompare(b.ubigeo));

  res.json({
    coberturaInversion: {
      departamentosConDatos: departamentosConInversion,
      nota: "investments (radar-inversiones) no cubre todo el país por diseño — un distrito sin inversión aquí puede ser un distrito no ingerido todavía, no necesariamente un distrito sin inversión real en la fuente (Invierte.pe).",
    },
    funcionesSaludConsultadas: FUNCIONES_SALUD,
    resultados,
  });
}));
