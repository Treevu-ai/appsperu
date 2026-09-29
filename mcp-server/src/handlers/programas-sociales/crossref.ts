import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";

/**
 * Confirmado en vivo contra `investments` (radar-inversiones) el 2026-09-05:
 * PROTECCIÓN SOCIAL y ASISTENCIA Y PREVISION SOCIAL son los dos valores de
 * `funcion` relevantes. Copiado tal cual del route Express.
 */
const FUNCIONES_SOCIAL = ["PROTECCIÓN SOCIAL", "ASISTENCIA Y PREVISION SOCIAL"];

interface InvestmentAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
}

interface CoberturaAgg {
  ubigeo: string;
  fechaCorte: string;
  juntosHogaresAfiliados: number | null;
  pension65Usuarios: number | null;
  qaliwarmaNinosAtendidos: number | null;
}

/**
 * Handler para `programas_sociales_crossref` — GET /api/crossref.
 *
 * Origen: apps/programas-sociales/api/src/routes/crossref.ts. Cruza inversión
 * en protección social (radar-inversiones, cross-app) con cobertura INFOMIDIS
 * (base propia). Consultas SECUENCIALES en el mismo orden que el route
 * Express: cobertura territorial de investments, agregado de inversión,
 * cobertura social — nunca Promise.all entre bases distintas.
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
  const invParams: unknown[] = [FUNCIONES_SOCIAL, departamento];
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

  const covConditions = ["ubigeo IS NOT NULL"];
  const covParams: unknown[] = [];
  if (ubigeo) {
    covParams.push(ubigeo);
    covConditions.push(`ubigeo = $${covParams.length}`);
  }

  const { rows: covRows } = await db.query<
    {
      ubigeo: string;
      fecha_corte: string;
      juntos_hogares_afiliados: string | null;
      pension65_usuarios: string | null;
      qaliwarma_ninos_atendidos: string | null;
    } & NeonRow
  >(
    `SELECT DISTINCT ON (ubigeo) ubigeo, fecha_corte, juntos_hogares_afiliados, pension65_usuarios, qaliwarma_ninos_atendidos
     FROM cobertura_social
     WHERE ${covConditions.join(" AND ")}
     ORDER BY ubigeo, fecha_corte DESC`,
    covParams
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
  const coberturaByUbigeo = new Map<string, CoberturaAgg>(
    covRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        fechaCorte: r.fecha_corte,
        juntosHogaresAfiliados: r.juntos_hogares_afiliados === null ? null : Number(r.juntos_hogares_afiliados),
        pension65Usuarios: r.pension65_usuarios === null ? null : Number(r.pension65_usuarios),
        qaliwarmaNinosAtendidos: r.qaliwarma_ninos_atendidos === null ? null : Number(r.qaliwarma_ninos_atendidos),
      },
    ])
  );

  const resultados = [...investmentsByUbigeo.keys()]
    .map((u) => {
      const inv = investmentsByUbigeo.get(u)!;
      const cov = coberturaByUbigeo.get(u) ?? null;
      return {
        ubigeo: u,
        departamento: inv.departamento,
        provincia: inv.provincia,
        distrito: inv.distrito,
        inversionSocial: { inversiones: inv.inversiones, montoViableTotal: inv.montoViableTotal, costoActualizadoTotal: inv.costoActualizadoTotal },
        coberturaSocial: cov,
        puntoCiego: cov === null,
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
      coberturaSocial: {
        nota: "cobertura_social (INFOMIDIS) es nacional y no distingue departamento en su propia fuente — este cruce solo lista distritos con inversión registrada (acotados por `departamento`), no todos los distritos con cobertura social.",
      },
      funcionesSocialConsultadas: FUNCIONES_SOCIAL,
      resultados,
    },
  };
}
