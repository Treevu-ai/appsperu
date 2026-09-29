import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";

interface EmpresasAgg {
  ubigeo: string;
  distrito: string | null;
  anio: number;
  mes: number;
  numeroEmpresas: number | null;
}

interface InvestmentAgg {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  inversiones: number;
  montoViableTotal: number;
  costoActualizadoTotal: number;
}

/**
 * Handler para `actividad_empresarial_crossref` — GET /api/crossref.
 *
 * Origen: apps/actividad-empresarial/api/src/routes/crossref.ts. Cruza
 * inversión pública total (radar-inversiones, cross-app) con el conteo de
 * empresas activas (base propia). Consultas SECUENCIALES en el mismo orden
 * que el route Express: cobertura de investments, último corte de empresas,
 * empresas del corte, inversión — nunca Promise.all entre bases distintas.
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

  const { rows: ultimoCorteRows } = await db.query<{ anio: number; mes: number } & NeonRow>(
    "SELECT anio, mes FROM empresas_privadas_distrito ORDER BY anio DESC, mes DESC LIMIT 1"
  );
  const ultimoCorte = ultimoCorteRows[0] ?? null;

  const empresasConditions: string[] = [];
  const empresasParams: unknown[] = [];
  if (ultimoCorte) {
    empresasParams.push(ultimoCorte.anio, ultimoCorte.mes);
    empresasConditions.push(`anio = $${empresasParams.length - 1}`, `mes = $${empresasParams.length}`);
  }
  if (ubigeo) {
    empresasParams.push(ubigeo);
    empresasConditions.push(`ubigeo = $${empresasParams.length}`);
  }
  const empresasWhere = empresasConditions.length > 0 ? `WHERE ${empresasConditions.join(" AND ")}` : "";

  const { rows: empresasRows } = ultimoCorte
    ? await db.query<
        { ubigeo: string; distrito: string | null; anio: number; mes: number; numero_empresas: string | null } & NeonRow
      >(`SELECT ubigeo, distrito, anio, mes, numero_empresas FROM empresas_privadas_distrito ${empresasWhere}`, empresasParams)
    : { rows: [] as Array<{ ubigeo: string; distrito: string | null; anio: number; mes: number; numero_empresas: string | null }> };

  const invConditions = ["departamento = $1", "ubigeo IS NOT NULL"];
  const invParams: unknown[] = [departamento];
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

  const empresasByUbigeo = new Map<string, EmpresasAgg>(
    empresasRows.map((r) => [
      r.ubigeo,
      {
        ubigeo: r.ubigeo,
        distrito: r.distrito,
        anio: r.anio,
        mes: r.mes,
        numeroEmpresas: r.numero_empresas === null ? null : Number(r.numero_empresas),
      },
    ])
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

  const allUbigeos = new Set([...empresasByUbigeo.keys(), ...investmentsByUbigeo.keys()]);

  const resultados = [...allUbigeos]
    .map((u) => {
      const emp = empresasByUbigeo.get(u) ?? null;
      const inv = investmentsByUbigeo.get(u) ?? null;
      return {
        ubigeo: u,
        distrito: inv?.distrito ?? emp?.distrito ?? null,
        departamento: inv?.departamento ?? null,
        empresasActivas: emp
          ? { numeroEmpresas: emp.numeroEmpresas, fechaCorte: `${emp.anio}-${String(emp.mes).padStart(2, "0")}` }
          : null,
        inversionTotal: inv
          ? {
              inversiones: inv.inversiones,
              montoViableTotal: inv.montoViableTotal,
              costoActualizadoTotal: inv.costoActualizadoTotal,
              fechaCorte: "actual (corte vigente de investments, no un año fijo)",
            }
          : null,
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
      nota: "Cruce descriptivo, sin inferencia de causalidad: un distrito con pocas empresas o poca inversión no está siendo evaluado como deficiente. `empresasActivas` y `inversionTotal` tienen fechas de referencia distintas (ver `fechaCorte` de cada uno) y no deben leerse como comparables sin esa aclaración.",
      resultados,
    },
  };
}
