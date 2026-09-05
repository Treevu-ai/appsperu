import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ubigeo: z.string().min(1).optional(),
});

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
 * Cruce DESCRIPTIVO entre inversión pública total (todas las funciones, no
 * una específica — no existe una categoría de gasto para "actividad
 * empresarial") y el conteo de empresas activas por distrito. A propósito
 * NO incluye un campo tipo "puntoCiego": a diferencia de servicios de
 * salud, un distrito con pocas empresas no es un problema que la inversión
 * "deba" resolver — es solo una característica del territorio. Ver
 * PRD_Actividad_Empresarial_Formal_v1.md §7 (requisito no funcional: sin
 * inferencia de causalidad).
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const departamento = (parsed.departamento ?? "LA LIBERTAD").toUpperCase().trim();
  const ubigeo = parsed.ubigeo?.trim();

  // Alcance territorial real de `investments`, consultado en vivo — no un
  // valor fijo en código (mismo criterio que servicios-salud/programas-sociales).
  const { rows: coberturaRows } = await inversionesPool.query<{ departamento: string }>(
    "SELECT DISTINCT departamento FROM investments WHERE departamento IS NOT NULL ORDER BY departamento"
  );
  const departamentosConInversion = coberturaRows.map((r) => r.departamento);

  // Corte más reciente disponible de empresas — no hardcodear "2022-12".
  // Si en el futuro se ingiere un año/mes posterior, este endpoint lo usa
  // automáticamente sin cambios de código.
  const { rows: ultimoCorteRows } = await pool.query<{ anio: number; mes: number }>(
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
    ? await pool.query<{ ubigeo: string; distrito: string | null; anio: number; mes: number; numero_empresas: string | null }>(
        `SELECT ubigeo, distrito, anio, mes, numero_empresas FROM empresas_privadas_distrito ${empresasWhere}`,
        empresasParams
      )
    : { rows: [] as Array<{ ubigeo: string; distrito: string | null; anio: number; mes: number; numero_empresas: string | null }> };

  const invConditions = ["departamento = $1", "ubigeo IS NOT NULL"];
  const invParams: unknown[] = [departamento];
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

  res.json({
    coberturaInversion: {
      departamentosConDatos: departamentosConInversion,
      nota: "investments (radar-inversiones) no cubre todo el país por diseño — un distrito sin inversión aquí puede ser un distrito no ingerido todavía, no necesariamente un distrito sin inversión real en la fuente (Invierte.pe).",
    },
    nota: "Cruce descriptivo, sin inferencia de causalidad: un distrito con pocas empresas o poca inversión no está siendo evaluado como deficiente. `empresasActivas` y `inversionTotal` tienen fechas de referencia distintas (ver `fechaCorte` de cada uno) y no deben leerse como comparables sin esa aclaración.",
    resultados,
  });
}));
