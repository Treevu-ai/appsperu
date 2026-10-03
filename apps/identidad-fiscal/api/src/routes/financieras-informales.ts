import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { seguridadPool } from "../db/seguridad-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const financierasInformalesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  soloActivas: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

financierasInformalesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SearchQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, soloActivas, limit, offset } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (departamento) {
      params.push(departamento.toUpperCase());
      conditions.push(`departamento = $${params.length}`);
    }
    if (soloActivas === "true") {
      conditions.push(`estado_contribuyente = 'ACTIVO'`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM financieras_informales_candidatas ${where}`,
      params
    );
    const total = Number(countRows[0].total);

    const { rows } = await pool.query(
      `SELECT ruc, razon_social, ubigeo, departamento, estado_contribuyente, condicion_domicilio
       FROM financieras_informales_candidatas ${where}
       ORDER BY departamento NULLS LAST, razon_social
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        ruc: r.ruc,
        razonSocial: r.razon_social,
        ubigeo: r.ubigeo,
        departamento: r.departamento,
        estadoContribuyente: r.estado_contribuyente,
        condicionDomicilio: r.condicion_domicilio,
      })),
    });
  })
);

/**
 * GOT-11 adaptado: agregados por departamento, cruzando la cantidad de
 * candidatas (Padrón RUC, por nombre) con la tasa de extorsión por 100k
 * habitantes (SIDPOL + `poblacion_departamental`, mismo denominador que usa
 * el Termómetro SIDPOL). Se exponen como DOS señales independientes --
 * `candidatas`/`candidatasActivas` y `tasaExtorsion100k` -- no como un
 * ratio combinado (`score_riesgo` del PRD original): no hay evidencia
 * directa de que una financiera informal específica esté vinculada a los
 * casos de extorsión de su departamento, solo que ambos fenómenos
 * coexisten geográficamente. Mezclarlos en un solo número implicaría una
 * relación causal que esta fuente no puede sustentar.
 */
// Comparación de delta año a año: hardcodeado a 2024 vs 2025 (no al MAX(anio)
// dinámico) porque 2026 está parcial -- un solo fetch SIDPOL el 2026-10-01 con
// datos solo hasta julio (ver raw_sidpol_batches). Comparar 2026 parcial contra
// 2025 completo infla artificialmente cualquier caída. 2024 y 2025 son los dos
// últimos años cerrados, verificados en vivo (La Libertad: 5096 -> 4333, -15%).
const ANIO_ACTUAL_DELTA = 2025;
const ANIO_ANTERIOR_DELTA = 2024;

financierasInformalesRouter.get(
  "/resumen-geo",
  asyncHandler(async (_req, res) => {
    const [{ rows: candidatasRows }, { rows: extorsionRows }, { rows: poblacionRows }, { rows: deltaRows }] =
      await Promise.all([
        pool.query<{ departamento: string | null; candidatas: string; candidatas_activas: string }>(
          `SELECT departamento, COUNT(*) AS candidatas,
                COUNT(*) FILTER (WHERE estado_contribuyente = 'ACTIVO') AS candidatas_activas
         FROM financieras_informales_candidatas
         GROUP BY departamento`
        ),
        seguridadPool.query<{ departamento: string; anio: number; total: string }>(
          `SELECT departamento, anio, SUM(cantidad) AS total
         FROM police_reports
         WHERE modalidad = 'Extorsión' AND anio = (SELECT MAX(anio) FROM police_reports WHERE modalidad = 'Extorsión')
         GROUP BY departamento, anio`
        ),
        seguridadPool.query<{ departamento: string; poblacion: number }>(
          `SELECT departamento, poblacion FROM poblacion_departamental`
        ),
        seguridadPool.query<{ departamento: string; anio: number; total: string }>(
          `SELECT departamento, anio, SUM(cantidad) AS total
         FROM police_reports
         WHERE modalidad = 'Extorsión' AND anio IN ($1, $2)
         GROUP BY departamento, anio`,
          [ANIO_ACTUAL_DELTA, ANIO_ANTERIOR_DELTA]
        ),
      ]);

    // `seguridad-ciudadana` reporta Lima partida en "LIMA METROPOLITANA" +
    // "REGION LIMA" (y Callao como "PROV. CONST. DEL CALLAO"), mismo
    // criterio que `poblacion_departamental` (ver Termómetro SIDPOL) -- el
    // Padrón RUC decodifica ubigeo al nombre de departamento INEI estándar
    // ("LIMA"/"CALLAO"), así que sin normalizar este cruce nunca encuentra
    // las 78 candidatas de Lima ni las 6 de Callao (hallazgo confirmado en
    // vivo: ambas filas aparecían con extorsionTotal/poblacion null).
    const normalizarDepartamento = (d: string): string => {
      if (d === "LIMA METROPOLITANA" || d === "REGION LIMA") return "LIMA";
      if (d === "PROV. CONST. DEL CALLAO") return "CALLAO";
      return d;
    };

    const poblacionPorDepartamento = new Map<string, number>();
    for (const r of poblacionRows) {
      const dep = normalizarDepartamento(r.departamento);
      poblacionPorDepartamento.set(dep, (poblacionPorDepartamento.get(dep) ?? 0) + r.poblacion);
    }

    const extorsionPorDepartamento = new Map<string, { total: number; anio: number }>();
    for (const r of extorsionRows) {
      const dep = normalizarDepartamento(r.departamento);
      const actual = extorsionPorDepartamento.get(dep);
      extorsionPorDepartamento.set(dep, { total: (actual?.total ?? 0) + Number(r.total), anio: r.anio });
    }

    const deltaPorDepartamento = new Map<string, { actual: number | null; anterior: number | null }>();
    for (const r of deltaRows) {
      const dep = normalizarDepartamento(r.departamento);
      const entry = deltaPorDepartamento.get(dep) ?? { actual: null, anterior: null };
      if (r.anio === ANIO_ACTUAL_DELTA) entry.actual = (entry.actual ?? 0) + Number(r.total);
      if (r.anio === ANIO_ANTERIOR_DELTA) entry.anterior = (entry.anterior ?? 0) + Number(r.total);
      deltaPorDepartamento.set(dep, entry);
    }

    const candidatasPorDepartamento = new Map(
      candidatasRows
        .filter((r): r is typeof r & { departamento: string } => r.departamento !== null)
        .map((r) => [r.departamento, { candidatas: Number(r.candidatas), candidatasActivas: Number(r.candidatas_activas) }])
    );

    const departamentos = new Set([
      ...candidatasPorDepartamento.keys(),
      ...extorsionPorDepartamento.keys(),
      ...deltaPorDepartamento.keys(),
    ]);

    const resumen = [...departamentos].map((departamento) => {
      const candidatas = candidatasPorDepartamento.get(departamento);
      const extorsion = extorsionPorDepartamento.get(departamento);
      const poblacion = poblacionPorDepartamento.get(departamento) ?? null;
      const tasaExtorsion100k =
        extorsion && poblacion ? Math.round((extorsion.total / poblacion) * 100_000 * 10) / 10 : null;

      const delta = deltaPorDepartamento.get(departamento);
      const deltaExtorsionPct =
        delta !== undefined && delta.actual !== null && delta.anterior !== null && delta.anterior > 0
          ? Math.round(((delta.actual - delta.anterior) / delta.anterior) * 100 * 10) / 10
          : null;

      return {
        departamento,
        candidatas: candidatas?.candidatas ?? 0,
        candidatasActivas: candidatas?.candidatasActivas ?? 0,
        extorsionTotal: extorsion?.total ?? null,
        extorsionAnio: extorsion?.anio ?? null,
        poblacion,
        tasaExtorsion100k,
        extorsion2024: delta?.anterior ?? null,
        extorsion2025: delta?.actual ?? null,
        deltaExtorsionPct,
      };
    });

    resumen.sort((a, b) => (b.tasaExtorsion100k ?? -1) - (a.tasaExtorsion100k ?? -1));

    res.json({
      resumen,
      nota:
        "candidatas/candidatasActivas vienen de coincidencia de nombre en el Padrón RUC " +
        "(no hay CIIU en el padrón nacional completo, ver docs/prd/PRD-003-mapa-gota-gota.md). " +
        "tasaExtorsion100k es independiente -- ambas señales se muestran juntas por geografía " +
        "compartida, no como un score combinado: no hay evidencia de que relacione una " +
        "financiera específica con casos de extorsión concretos. " +
        "deltaExtorsionPct compara 2024 vs 2025 (los dos últimos años cerrados) -- no se usa " +
        "2026 porque SIDPOL solo tiene datos hasta julio de ese año (fetch único, 2026-10-01), " +
        "y mezclarlo con un año completo infla artificialmente cualquier caída.",
    });
  })
);
