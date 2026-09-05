import { Router } from "express";
import { z } from "zod";
import { LATEST_BUDGET_CTE } from "@appsperu/shared-queries";
import { pool } from "../db/pool.js";
import { inversionesPool } from "../db/inversiones-pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const crossrefRouter = Router();

const CrossrefQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

const CrossrefEjecucionQuerySchema = z.object({
  confidence: z.enum(["confirmada", "candidata"]).optional(),
});

/**
 * Cruce INFOBRAS <-> radar-inversiones por CUI — a diferencia del cruce por
 * nombre de entidad (compras-publicas), acá SÍ hay una clave compartida
 * exacta entre las dos fuentes (`Codigo unico de inversión` en INFOBRAS,
 * `cui` en investments), así que no hace falta matching difuso: se agrega
 * en vivo por CUI y se junta en la capa de aplicación, mismo patrón que el
 * cruce SEC_EJEC de radar-inversiones <-> radar-ejecucion.
 */
crossrefRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefQuerySchema, req.query, res);
    if (!parsed) return;
    const wantedDepartamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

    const { rows: obraRows } = await pool.query(
      `SELECT cui,
              COUNT(*) AS obras,
              COUNT(*) FILTER (WHERE existe_paralizacion) AS obras_paralizadas,
              AVG(avance_fisico_real_pct) AS avance_fisico_real_promedio
       FROM public_works
       WHERE departamento = $1 AND cui IS NOT NULL AND cui != ''
       GROUP BY cui`,
      [wantedDepartamento]
    );

    if (obraRows.length === 0) {
      res.json({ resultados: [] });
      return;
    }

    const cuis = obraRows.map((r) => r.cui);

    const { rows: inversionRows } = await inversionesPool.query(
      `SELECT cui, nombre, estado, monto_viable, costo_actualizado
       FROM investments
       WHERE cui = ANY($1)`,
      [cuis]
    );

    const inversionByCui = new Map(inversionRows.map((r) => [r.cui, r]));

    res.json({
      resultados: obraRows.map((r) => {
        const inversion = inversionByCui.get(r.cui);
        return {
          cui: r.cui,
          obras: Number(r.obras),
          obrasParalizadas: Number(r.obras_paralizadas),
          avanceFisicoRealPromedio:
            r.avance_fisico_real_promedio === null ? null : Math.round(Number(r.avance_fisico_real_promedio) * 100) / 100,
          enInversiones: Boolean(inversion),
          nombreInversion: inversion?.nombre ?? null,
          estadoInversion: inversion?.estado ?? null,
          montoViableInversion: inversion ? Number(inversion.monto_viable) || 0 : null,
          costoActualizadoInversion: inversion ? Number(inversion.costo_actualizado) || 0 : null,
        };
      }),
    });
  })
);

/**
 * Cruce INFOBRAS <-> radar-ejecucion por nombre de entidad — a diferencia
 * del cruce por CUI de arriba, acá no hay clave compartida exacta, así que
 * se reutiliza el mismo matcher difuso de compras-publicas (ver
 * `../crossref/match.ts`) sobre el crosswalk persistido en `entity_crosswalk`
 * (recalculable con `npm run crossref:build`). Los indicadores (devengado,
 * obras paralizadas) se consultan en vivo, igual que en compras-publicas.
 */
crossrefRouter.get(
  "/ejecucion",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(CrossrefEjecucionQuerySchema, req.query, res);
    if (!parsed) return;
    const { confidence } = parsed;

    const params: unknown[] = [];
    let where = "";
    if (confidence) {
      params.push(confidence);
      where = `WHERE confidence = $${params.length}`;
    }

    const { rows: crosswalk } = await pool.query(
      `SELECT ejecucion_entity_code, ejecucion_nombre, infobras_codigo_entidad, infobras_entidad_nombre,
              confidence, score, computed_at
       FROM entity_crosswalk
       ${where}
       ORDER BY confidence, ejecucion_nombre`,
      params
    );

    if (crosswalk.length === 0) {
      res.json({ resultados: [] });
      return;
    }

    const entityCodes = crosswalk.map((r) => r.ejecucion_entity_code);
    const codigosEntidad = crosswalk.map((r) => r.infobras_codigo_entidad);

    const [devengadoResult, obrasResult] = await Promise.all([
      ejecucionPool.query(
        `${LATEST_BUDGET_CTE}
         SELECT entity_code, SUM(devengado) AS devengado, array_agg(DISTINCT fecha_corte) AS cortes
         FROM latest_budget
         WHERE entity_code = ANY($1)
         GROUP BY entity_code`,
        [entityCodes]
      ),
      pool.query(
        `SELECT codigo_entidad,
                COUNT(*) AS obras,
                COUNT(*) FILTER (WHERE existe_paralizacion) AS obras_paralizadas
         FROM public_works
         WHERE codigo_entidad = ANY($1)
         GROUP BY codigo_entidad`,
        [codigosEntidad]
      ),
    ]);

    const devengadoByEntity = new Map(devengadoResult.rows.map((r) => [r.entity_code, { devengado: Number(r.devengado), cortes: r.cortes }]));
    const obrasByCodigoEntidad = new Map(
      obrasResult.rows.map((r) => [
        r.codigo_entidad,
        { obras: Number(r.obras), obrasParalizadas: Number(r.obras_paralizadas) },
      ])
    );

    res.json({
      resultados: crosswalk.map((r) => {
        const obras = obrasByCodigoEntidad.get(r.infobras_codigo_entidad) ?? { obras: 0, obrasParalizadas: 0 };
        return {
          ejecucionEntityCode: r.ejecucion_entity_code,
          ejecucionNombre: r.ejecucion_nombre,
          infobrasCodigoEntidad: r.infobras_codigo_entidad,
          infobrasEntidadNombre: r.infobras_entidad_nombre,
          confidence: r.confidence,
          score: Number(r.score),
          devengado: devengadoByEntity.get(r.ejecucion_entity_code)?.devengado ?? 0,
          coberturaTemporal: devengadoByEntity.has(r.ejecucion_entity_code)
            ? { cortesUsados: devengadoByEntity.get(r.ejecucion_entity_code)!.cortes, estado: "PARCIAL" }
            : null,
          obras: obras.obras,
          obrasParalizadas: obras.obrasParalizadas,
          computedAt: r.computed_at,
        };
      }),
    });
  })
);
