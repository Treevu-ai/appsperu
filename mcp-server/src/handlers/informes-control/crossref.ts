import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { getPoolForApp, type NeonEnv } from "../../db/neon-env.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import { matchEntitiesToInformes } from "./_helpers.js";

/**
 * Handler para `informes_control_crossref` — GET /api/crossref.
 *
 * Origen: apps/informes-control/api/src/routes/crossref.ts. Cruza entidades
 * de radar-ejecucion (cross-app) con informes de Contraloría (base propia)
 * por nombre (matcher difuso, sin ID compartido). Consultas SECUENCIALES en
 * el mismo orden que el route Express: entidades de radar-ejecucion,
 * informes propios, y — solo si hay matches — devengado agregado de
 * radar-ejecucion.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;
  const wantedDepartamento = ((args.departamento as string | undefined)?.toUpperCase().trim()) ?? "LA LIBERTAD";

  const ejecucionPool = getPoolForApp(env as NeonEnv, "radar-ejecucion");
  if (!ejecucionPool) {
    return { status: 503, body: { error: "Servicio radar-ejecucion no disponible: falta la conexión a su base de datos." } };
  }

  const { rows: entityRows } = await ejecucionPool.query<{ entity_code: string; nombre: string } & NeonRow>(
    `SELECT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );

  const { rows: informesRows } = await db.query<
    { entidad: string; total_informes: string; informes_con_responsabilidad: string } & NeonRow
  >(
    `SELECT entidad,
            COUNT(*) AS total_informes,
            COUNT(*) FILTER (WHERE es_con_responsabilidad) AS informes_con_responsabilidad
     FROM informes_control
     WHERE departamento = $1 AND entidad IS NOT NULL
     GROUP BY entidad`,
    [wantedDepartamento]
  );

  if (informesRows.length === 0 || entityRows.length === 0) {
    return {
      status: 200,
      body: { departamento: wantedDepartamento, totalEntidadesMef: entityRows.length, totalInformesEntidades: informesRows.length, resultados: [] },
    };
  }

  const matches = matchEntitiesToInformes(
    entityRows.map((r) => ({ entityCode: r.entity_code, nombre: r.nombre })),
    informesRows.map((r) => ({
      entidad: r.entidad,
      totalInformes: Number(r.total_informes),
      informesConResponsabilidad: Number(r.informes_con_responsabilidad),
    }))
  );

  const entityCodes = [...new Set(matches.map((m) => m.mefEntityCode))];

  const devengadoByEntity = new Map<string, number>();
  if (entityCodes.length > 0) {
    const { rows: devengadoRows } = await ejecucionPool.query<{ entity_code: string; devengado: string } & NeonRow>(
      `${LATEST_BUDGET_CTE}
       SELECT b.entity_code AS entity_code, SUM(b.devengado) AS devengado
       FROM latest_budget b
       WHERE b.entity_code = ANY($1)
       GROUP BY b.entity_code`,
      [entityCodes]
    );
    for (const r of devengadoRows) devengadoByEntity.set(r.entity_code, Number(r.devengado));
  }

  return {
    status: 200,
    body: {
      departamento: wantedDepartamento,
      totalEntidadesMef: entityRows.length,
      totalInformesEntidades: informesRows.length,
      resultados: matches.map((m) => ({
        entityCode: m.mefEntityCode,
        nombreEnRadarEjecucion: m.mefNombre,
        entidadEnInformesControl: m.entidad,
        confidence: m.confidence,
        score: m.score,
        totalInformes: m.totalInformes,
        informesConResponsabilidad: m.informesConResponsabilidad,
        devengadoTotal: devengadoByEntity.get(m.mefEntityCode) ?? null,
      })),
    },
  };
}
