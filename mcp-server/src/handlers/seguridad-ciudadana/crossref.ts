import type { NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface DenunciaModalidadRow extends NeonRow {
  modalidad: string;
  total: string;
}

interface EjecucionRow extends NeonRow {
  pim: string;
  devengado: string;
}

interface EjecucionNacionalRow extends NeonRow {
  pim: string;
  devengado: string;
  entidades: string;
}

/**
 * Handler para `seguridad_ciudadana_crossref` — GET /api/crossref.
 *
 * Cruce seguridad-ciudadana (SIDPOL) <-> radar-ejecucion (gasto en la función
 * ORDEN PUBLICO Y SEGURIDAD) por `departamento` exacto. SQL idéntico a
 * `apps/seguridad-ciudadana/api/src/routes/crossref.ts`, salvo que la segunda
 * base (antes `ejecucionPool`) se resuelve acá vía
 * `crossAppPool("radar-ejecucion", env)`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const departamento = (args.departamento as string).toUpperCase();
  const anio = Number(args.anio);

  const ejecucionDb = crossAppPool("radar-ejecucion", env);
  if (!ejecucionDb) return crossAppUnavailable("radar-ejecucion");

  const { rows: denunciasRows } = await db.query<DenunciaModalidadRow>(
    `SELECT modalidad, SUM(cantidad)::text AS total
       FROM police_reports
      WHERE departamento = $1 AND anio = $2
      GROUP BY modalidad
      ORDER BY SUM(cantidad) DESC`,
    [departamento, anio],
  );

  const { rows: regionalRows } = await ejecucionDb.query<EjecucionRow>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE b.funcion = 'ORDEN PUBLICO Y SEGURIDAD' AND b.anio_fiscal = $1 AND t.departamento = $2
       AND b.meta_departamento IS NULL`,
    [anio, departamento],
  );

  const { rows: nacionalRows } = await ejecucionDb.query<EjecucionNacionalRow>(
    `${LATEST_BUDGET_CTE}
     SELECT COALESCE(SUM(b.pim), 0) AS pim, COALESCE(SUM(b.devengado), 0) AS devengado,
            COUNT(DISTINCT b.entity_code) AS entidades
     FROM latest_budget b
     WHERE b.funcion = 'ORDEN PUBLICO Y SEGURIDAD' AND b.anio_fiscal = $1 AND b.meta_departamento = $2`,
    [anio, departamento],
  );

  const toNum = (v: string | undefined) => Number(v ?? 0);
  const regional = { pim: toNum(regionalRows[0]?.pim), devengado: toNum(regionalRows[0]?.devengado) };
  const nacional = {
    pim: toNum(nacionalRows[0]?.pim),
    devengado: toNum(nacionalRows[0]?.devengado),
    entidades: toNum(nacionalRows[0]?.entidades),
  };
  const pimTotal = regional.pim + nacional.pim;
  const devengadoTotal = regional.devengado + nacional.devengado;
  const totalDenuncias = denunciasRows.reduce((sum, r) => sum + Number(r.total), 0);

  return {
    status: 200,
    body: {
      departamento,
      anio,
      denuncias: {
        total: totalDenuncias,
        porModalidad: denunciasRows.map((r) => ({ modalidad: r.modalidad, total: Number(r.total) })),
      },
      ejecucionOrdenPublicoYSeguridad: {
        ejecucionRegionalLocal: {
          pim: regional.pim,
          devengado: regional.devengado,
          avancePct: regional.pim > 0 ? Math.round((regional.devengado / regional.pim) * 10000) / 100 : null,
        },
        ejecucionNacionalDirigida: {
          pim: nacional.pim,
          devengado: nacional.devengado,
          avancePct: nacional.pim > 0 ? Math.round((nacional.devengado / nacional.pim) * 10000) / 100 : null,
          entidadesDistintas: nacional.entidades,
        },
        total: {
          pim: pimTotal,
          devengado: devengadoTotal,
          avancePct: pimTotal > 0 ? Math.round((devengadoTotal / pimTotal) * 10000) / 100 : null,
        },
      },
    },
  };
}
