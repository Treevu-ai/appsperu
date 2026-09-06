import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { matchEntitiesToInformes } from "../crossref/match.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

/**
 * Cruce entidad <-> informes de auditoría, por nombre (no hay ID
 * compartido — `CodigoEntidad` viene `null` en la fuente real de
 * Contraloría, ver data contract). Reutiliza el mismo matcher difuso que
 * `identidad-fiscal/crossref/entidades` y el mismo patrón de agregación de
 * devengado (sin filtrar por función — un informe de auditoría puede
 * corresponder a cualquier sector) que `radar-inversiones/crossref`.
 *
 * Responde: de las entidades con ejecución presupuestal en el
 * departamento, ¿cuáles tienen informes de auditoría, y cuántos de esos
 * informes tienen un hallazgo de responsabilidad? Nunca dice de quién —
 * `es_con_responsabilidad` es agregado (conteo), no un nombre.
 */
crossrefRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
  if (!parsed) return;
  const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

  const { rows: entityRows } = await ejecucionPool.query<{ entity_code: string; nombre: string }>(
    `SELECT e.entity_code, e.nombre
     FROM entities e
     JOIN territories t ON t.ubigeo = e.ubigeo
     WHERE t.departamento = $1`,
    [wantedDepartamento]
  );

  const { rows: informesRows } = await pool.query<{
    entidad: string;
    total_informes: string;
    informes_con_responsabilidad: string;
  }>(
    `SELECT entidad,
            COUNT(*) AS total_informes,
            COUNT(*) FILTER (WHERE es_con_responsabilidad) AS informes_con_responsabilidad
     FROM informes_control
     WHERE departamento = $1 AND entidad IS NOT NULL
     GROUP BY entidad`,
    [wantedDepartamento]
  );

  if (informesRows.length === 0 || entityRows.length === 0) {
    res.json({ departamento: wantedDepartamento, totalEntidadesMef: entityRows.length, totalInformesEntidades: informesRows.length, resultados: [] });
    return;
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
    const { rows: devengadoRows } = await ejecucionPool.query<{ entity_code: string; devengado: string }>(
      `${LATEST_BUDGET_CTE}
       SELECT b.entity_code AS entity_code, SUM(b.devengado) AS devengado
       FROM latest_budget b
       WHERE b.entity_code = ANY($1)
       GROUP BY b.entity_code`,
      [entityCodes]
    );
    for (const r of devengadoRows) devengadoByEntity.set(r.entity_code, Number(r.devengado));
  }

  res.json({
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
  });
}));
