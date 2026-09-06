import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

/**
 * Confirmado en vivo contra `investments` (radar-inversiones) el 2026-09-05:
 * PROTECCIÓN SOCIAL (50 filas) y ASISTENCIA Y PREVISION SOCIAL (1 fila) son
 * los dos valores de `funcion` relevantes — mismo riesgo de fragmentación de
 * categorías que ya se confirmó para Salud (ver servicios-salud/crossref.ts).
 */
const FUNCIONES_SOCIAL = ["PROTECCIÓN SOCIAL", "ASISTENCIA Y PREVISION SOCIAL"];

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

interface CoberturaAgg {
  ubigeo: string;
  fechaCorte: string;
  juntosHogaresAfiliados: number | null;
  pension65Usuarios: number | null;
  qaliwarmaNinosAtendidos: number | null;
}

/**
 * Cruce inversión en protección social (Invierte.pe/CUI) <-> cobertura de
 * programas sociales (INFOMIDIS), agregado por UBIGEO exacto. A diferencia
 * de `servicios-salud`, `cobertura_social` no tiene columna de departamento
 * (INFOMIDIS no la trae) — el filtro `departamento` solo acota el lado de
 * `investments`; el lado de cobertura social se consulta a nivel nacional,
 * igual que ya declara `GET /api/cobertura` de esta misma app.
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const departamento = (parsed.departamento ?? "LA LIBERTAD").toUpperCase().trim();
  const ubigeo = parsed.ubigeo?.trim();

  // Alcance territorial real de `investments`, consultado en vivo — no un
  // valor fijo en código (mismo criterio que servicios-salud/crossref.ts).
  const { rows: coberturaRows } = await inversionesPool.query<{ departamento: string }>(
    "SELECT DISTINCT departamento FROM investments WHERE departamento IS NOT NULL ORDER BY departamento"
  );
  const departamentosConInversion = coberturaRows.map((r) => r.departamento);

  const invConditions = ["funcion = ANY($1)", "departamento = $2", "ubigeo IS NOT NULL"];
  const invParams: unknown[] = [FUNCIONES_SOCIAL, departamento];
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

  const covConditions = ["ubigeo IS NOT NULL"];
  const covParams: unknown[] = [];
  if (ubigeo) {
    covParams.push(ubigeo);
    covConditions.push(`ubigeo = $${covParams.length}`);
  }

  // Último corte disponible por distrito, igual que GET /api/cobertura.
  const { rows: covRows } = await pool.query<{
    ubigeo: string;
    fecha_corte: string;
    juntos_hogares_afiliados: string | null;
    pension65_usuarios: string | null;
    qaliwarma_ninos_atendidos: string | null;
  }>(
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

  // Solo se listan distritos con inversión (el lado acotado a un departamento);
  // cobertura social es nacional y no tiene columna de departamento para
  // acotar el otro sentido del cruce sin asumir un mapeo UBIGEO->departamento
  // no verificado en este ticket.
  const resultados = [...investmentsByUbigeo.keys()]
    .map((u) => {
      const inv = investmentsByUbigeo.get(u)!;
      const cov = coberturaByUbigeo.get(u) ?? null;
      return {
        ubigeo: u,
        departamento: inv.departamento,
        provincia: inv.provincia,
        distrito: inv.distrito,
        inversionSocial: {
          inversiones: inv.inversiones,
          montoViableTotal: inv.montoViableTotal,
          costoActualizadoTotal: inv.costoActualizadoTotal,
        },
        coberturaSocial: cov,
        // "Punto ciego": hay inversión en protección social registrada pero
        // el distrito no tiene ningún corte de INFOMIDIS (MIDIS no lo
        // reporta en absoluto), no solo un valor bajo en algún programa.
        puntoCiego: cov === null,
      };
    })
    .sort((a, b) => a.ubigeo.localeCompare(b.ubigeo));

  res.json({
    coberturaInversion: {
      departamentosConDatos: departamentosConInversion,
      nota: "investments (radar-inversiones) no cubre todo el país por diseño — un distrito sin inversión aquí puede ser un distrito no ingerido todavía, no necesariamente un distrito sin inversión real en la fuente (Invierte.pe).",
    },
    coberturaSocial: {
      nota: "cobertura_social (INFOMIDIS) es nacional y no distingue departamento en su propia fuente — este cruce solo lista distritos con inversión registrada (acotados por `departamento`), no todos los distritos con cobertura social.",
    },
    funcionesSocialConsultadas: FUNCIONES_SOCIAL,
    resultados,
  });
}));
