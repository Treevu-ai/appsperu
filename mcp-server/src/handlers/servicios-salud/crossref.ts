import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";

/**
 * Confirmado en vivo contra `investments` (radar-inversiones) el 2026-09-05:
 * SALUD y SALUD Y SANEAMIENTO son los dos valores de `funcion` relevantes.
 * SANEAMIENTO a secas NO se incluye. Copiado tal cual del route Express.
 */
const FUNCIONES_SALUD = ["SALUD", "SALUD Y SANEAMIENTO"];

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
 * Handler para `servicios_salud_crossref` — GET /api/crossref.
 *
 * Origen: apps/servicios-salud/api/src/routes/crossref.ts. Cruza inversión en
 * salud (radar-inversiones, cross-app) con establecimientos RENIPRESS (base
 * propia). Consultas SECUENCIALES: primero la cobertura territorial de
 * `investments` (radar-inversiones), luego el agregado de inversión (misma
 * base, secuencial porque ambas comparten la conexión de radar-inversiones),
 * y por último ipress (base propia) — mismo orden que el route Express, sin
 * Promise.all entre bases distintas.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase().trim();
  const ubigeo = (args.ubigeo as string | undefined)?.trim();

  const inversionesPool = getPoolForApp(env as NeonEnv, "radar-inversiones");
  if (!inversionesPool) {
    return { status: 503, body: { error: "Servicio radar-inversiones no disponible: falta la conexión a su base de datos." } };
  }

  const { rows: coberturaRows } = await inversionesPool.query<{ departamento: string } & NeonRow>(
    "SELECT DISTINCT departamento FROM investments WHERE departamento IS NOT NULL ORDER BY departamento"
  );
  const departamentosConInversion = coberturaRows.map((r) => r.departamento);

  const invConditions = ["funcion = ANY($1)", "departamento = $2", "ubigeo IS NOT NULL"];
  const invParams: unknown[] = [FUNCIONES_SALUD, departamento];
  if (ubigeo) {
    invParams.push(ubigeo);
    invConditions.push(`ubigeo = $${invParams.length}`);
  }

  const { rows: invRows } = await inversionesPool.query<
    {
      ubigeo: string;
      departamento: string;
      provincia: string | null;
      distrito: string | null;
      inversiones: string;
      monto_viable_total: string;
      costo_actualizado_total: string;
    } & NeonRow
  >(
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

  const { rows: ipressRows } = await db.query<
    {
      ubigeo: string;
      departamento: string;
      provincia: string | null;
      distrito: string | null;
      total: string;
      activos: string;
    } & NeonRow
  >(
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
          ? { inversiones: inv.inversiones, montoViableTotal: inv.montoViableTotal, costoActualizadoTotal: inv.costoActualizadoTotal }
          : null,
        ipress: ips ? { total: ips.total, activos: ips.activos } : null,
        puntoCiego: Boolean(inv) && (!ips || ips.activos === 0),
      };
    })
    .sort((a, b) => a.ubigeo.localeCompare(b.ubigeo));

  return {
    status: 200,
    body: {
      coberturaInversion: {
        departamentosConDatos: departamentosConInversion,
        nota: "investments (radar-inversiones) no cubre todo el país por diseño — un distrito sin inversión aquí puede ser un distrito no ingerido todavía, no necesariamente un distrito sin inversión real en la fuente (Invierte.pe).",
      },
      funcionesSaludConsultadas: FUNCIONES_SALUD,
      resultados,
    },
  };
}
