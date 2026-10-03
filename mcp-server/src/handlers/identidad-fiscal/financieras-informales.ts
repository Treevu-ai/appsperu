import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool, crossAppUnavailable } from "../proveedores-sancionados/_helpers.js";

interface CountRow extends NeonRow {
  total: string;
}

interface CandidataRow extends NeonRow {
  ruc: string;
  razon_social: string;
  ubigeo: string | null;
  departamento: string | null;
  estado_contribuyente: string | null;
  condicion_domicilio: string | null;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_financieras_informales` — GET /api/financieras-informales
 * SQL idéntico a apps/identidad-fiscal/api/src/routes/financieras-informales.ts
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const departamento = args.departamento as string | undefined;
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  const soloActivas = args.soloActivas as string | undefined;
  if (soloActivas === "true") {
    conditions.push(`estado_contribuyente = 'ACTIVO'`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM financieras_informales_candidatas ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<CandidataRow>(
    `SELECT ruc, razon_social, ubigeo, departamento, estado_contribuyente, condicion_domicilio
     FROM financieras_informales_candidatas ${where}
     ORDER BY departamento NULLS LAST, razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const rows = dataResult.rows;

  return {
    status: 200,
    body: {
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
    },
  };
}

interface GeoCandidataRow extends NeonRow {
  departamento: string | null;
  candidatas: string;
  candidatas_activas: string;
}

interface ExtorsionRow extends NeonRow {
  departamento: string;
  anio: number;
  total: string;
}

interface PoblacionRow extends NeonRow {
  departamento: string;
  poblacion: number;
}

// Comparación de delta año a año: hardcodeado a 2024 vs 2025 (no al MAX(anio)
// dinámico) porque 2026 está parcial -- un solo fetch SIDPOL el 2026-10-01 con
// datos solo hasta julio (ver raw_sidpol_batches). Comparar 2026 parcial contra
// 2025 completo infla artificialmente cualquier caída. 2024 y 2025 son los dos
// últimos años cerrados, verificados en vivo (La Libertad: 5096 -> 4333, -15%).
const ANIO_ACTUAL_DELTA = 2025;
const ANIO_ANTERIOR_DELTA = 2024;

/**
 * Handler para `identidad_fiscal_financieras_informales_resumen_geo` —
 * GET /api/financieras-informales/resumen-geo. SQL idéntico a
 * apps/identidad-fiscal/api/src/routes/financieras-informales.ts.
 */
export async function resumenGeo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, env } = ctx;
  const seguridadDb = crossAppPool("seguridad-ciudadana", env);
  if (!seguridadDb) return crossAppUnavailable("seguridad-ciudadana");

  const [candidatasResult, extorsionResult, poblacionResult, deltaResult] = await Promise.all([
    db.query<GeoCandidataRow>(
      `SELECT departamento, COUNT(*) AS candidatas,
              COUNT(*) FILTER (WHERE estado_contribuyente = 'ACTIVO') AS candidatas_activas
       FROM financieras_informales_candidatas
       GROUP BY departamento`
    ),
    seguridadDb.query<ExtorsionRow>(
      `SELECT departamento, anio, SUM(cantidad) AS total
       FROM police_reports
       WHERE modalidad = 'Extorsión' AND anio = (SELECT MAX(anio) FROM police_reports WHERE modalidad = 'Extorsión')
       GROUP BY departamento, anio`
    ),
    seguridadDb.query<PoblacionRow>(`SELECT departamento, poblacion FROM poblacion_departamental`),
    seguridadDb.query<ExtorsionRow>(
      `SELECT departamento, anio, SUM(cantidad) AS total
       FROM police_reports
       WHERE modalidad = 'Extorsión' AND anio IN ($1, $2)
       GROUP BY departamento, anio`,
      [ANIO_ACTUAL_DELTA, ANIO_ANTERIOR_DELTA]
    ),
  ]);

  const normalizarDepartamento = (d: string): string => {
    if (d === "LIMA METROPOLITANA" || d === "REGION LIMA") return "LIMA";
    if (d === "PROV. CONST. DEL CALLAO") return "CALLAO";
    return d;
  };

  const poblacionPorDepartamento = new Map<string, number>();
  for (const r of poblacionResult.rows) {
    const dep = normalizarDepartamento(r.departamento);
    poblacionPorDepartamento.set(dep, (poblacionPorDepartamento.get(dep) ?? 0) + r.poblacion);
  }

  const extorsionPorDepartamento = new Map<string, { total: number; anio: number }>();
  for (const r of extorsionResult.rows) {
    const dep = normalizarDepartamento(r.departamento);
    const actual = extorsionPorDepartamento.get(dep);
    extorsionPorDepartamento.set(dep, { total: (actual?.total ?? 0) + Number(r.total), anio: r.anio });
  }

  const deltaPorDepartamento = new Map<string, { actual: number | null; anterior: number | null }>();
  for (const r of deltaResult.rows) {
    const dep = normalizarDepartamento(r.departamento);
    const entry = deltaPorDepartamento.get(dep) ?? { actual: null, anterior: null };
    if (r.anio === ANIO_ACTUAL_DELTA) entry.actual = (entry.actual ?? 0) + Number(r.total);
    if (r.anio === ANIO_ANTERIOR_DELTA) entry.anterior = (entry.anterior ?? 0) + Number(r.total);
    deltaPorDepartamento.set(dep, entry);
  }

  const candidatasPorDepartamento = new Map(
    candidatasResult.rows
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

  return {
    status: 200,
    body: {
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
    },
  };
}
