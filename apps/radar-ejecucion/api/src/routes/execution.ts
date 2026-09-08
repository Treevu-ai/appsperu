import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { avancePct } from "../ingest/normalize.js";
import { LATEST_BUDGET_CTE } from "../db/budget-coverage.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const executionRouter = Router();

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

const ExecutionQuerySchema = z.object({
  nivel: z.string().min(1).optional(),
  funcion: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  ubigeo: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  /** Gasto dirigido a un departamento (DEPARTAMENTO_META), sin importar dónde
   * tenga sede la entidad ejecutora. Distinto de `departamento`, que filtra
   * por la sede de la entidad. */
  metaDepartamento: z.string().min(1).optional(),
  /** Clasificación económica de primer nivel (personal, bienes y servicios,
   * inversión, etc.) — ver ADR-0006 Decisión 1. Filtra por código GENERICA
   * (ej. "2.1"), no por nombre. */
  generica: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

executionRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ExecutionQuerySchema, req.query, res);
  if (!parsed) return;
  const { nivel, funcion, anio, ubigeo, departamento, metaDepartamento, generica, limit, offset } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`e.nivel_gobierno = $${params.length}`);
  }
  if (funcion) {
    params.push(funcion);
    conditions.push(`b.funcion = $${params.length}`);
  }
  if (anio) {
    params.push(Number(anio));
    conditions.push(`b.anio_fiscal = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`e.ubigeo = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`t.departamento = $${params.length}`);
  }
  if (metaDepartamento) {
    params.push(metaDepartamento.toUpperCase());
    conditions.push(`b.meta_departamento = $${params.length}`);
  }
  if (generica) {
    params.push(generica);
    conditions.push(`b.generica = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool.query<{ total: string }>(
    `${LATEST_BUDGET_CTE}
     SELECT COUNT(*) AS total
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await pool.query(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.anio_fiscal,
            b.pia, b.pim, b.devengado, b.fecha_corte, b.meta_departamento, rb.resource_id, b.generica, b.generica_nombre,
            t.provincia, t.distrito
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     ${where}
     ORDER BY b.devengado DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const cortesUsados = [...new Map(rows.map((r) => [
    `${r.meta_departamento ?? "SEDE_EJECUTORA"}:${r.fecha_corte}`,
    {
      particion: r.meta_departamento ? `META_DEPARTAMENTO:${r.meta_departamento}` : "SEDE_EJECUTORA",
      fechaCorte: r.fecha_corte,
    },
  ])).values()];

  // DQ-16: LATEST_BUDGET_CTE dedupe por (entity_code, funcion, anio_fiscal, ...) —
  // anio_fiscal es parte de la clave, así que NO colapsa entre años fiscales
  // distintos. Sin `anio` explícito, esta página puede mezclar más de un año
  // fiscal si alguna vez se ingiere un segundo. En vez de filtrar en silencio
  // (cambiaría el comportamiento por defecto de un CTE compartido por 5 apps),
  // se advierte explícitamente cuántos años fiscales trae la página — nunca
  // queda como una mezcla silenciosa.
  const aniosFiscalesUsados = [...new Set(rows.map((r) => r.anio_fiscal))].sort();

  res.json({
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    coberturaTemporal: {
      estado: "PARCIAL",
      cortesUsados,
      aniosFiscalesUsados,
      advertenciaMultiAnio:
        aniosFiscalesUsados.length > 1
          ? `Esta página mezcla ${aniosFiscalesUsados.length} años fiscales (${aniosFiscalesUsados.join(", ")}). Filtra por \`anio\` si necesitas un solo año fiscal — sumar sin ese filtro infla cualquier total agregado.`
          : null,
      limitacion: "Cada observación usa su último corte disponible; los cortes pueden diferir entre particiones de cobertura.",
    },
    resultados: rows.map((r) => ({
      entityCode: r.entity_code,
      nombre: r.nombre,
      nivelGobierno: r.nivel_gobierno,
      provincia: r.provincia,
      distrito: r.distrito,
      funcion: r.funcion,
      generica: r.generica,
      genericaNombre: r.generica_nombre,
      anioFiscal: r.anio_fiscal,
      pia: Number(r.pia),
      pim: Number(r.pim),
      devengado: Number(r.devengado),
      avancePct: avancePct({ pim: Number(r.pim), devengado: Number(r.devengado) }),
      fechaCorte: r.fecha_corte,
      fuente: { dataset: "MEF - Presupuesto y ejecución de gasto", resourceId: r.resource_id },
    })),
  });
}));

const GROUP_BY_COLUMNS = {
  funcion: "b.funcion",
  generica: "b.generica",
} as const;

const ExecutionResumenQuerySchema = z.object({
  groupBy: z.enum(Object.keys(GROUP_BY_COLUMNS) as [string, ...string[]])
    .describe("DQ-08: agrega PIA/PIM/devengado por 'funcion' o 'generica'. Un valor no soportado responde 400."),
  nivel: z.string().min(1).optional(),
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  ubigeo: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  metaDepartamento: z.string().min(1).optional(),
});

// DQ-08: agregación por función/genérica sin tener que paginar el universo
// completo y sumar client-side. Debe declararse antes de "/:entityCode" —
// si no, Express trataría "resumen" como un entityCode.
executionRouter.get("/resumen", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ExecutionResumenQuerySchema, req.query, res);
  if (!parsed) return;
  const { groupBy, nivel, anio, ubigeo, departamento, metaDepartamento } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (nivel) {
    params.push(nivel);
    conditions.push(`e.nivel_gobierno = $${params.length}`);
  }
  if (anio) {
    params.push(Number(anio));
    conditions.push(`b.anio_fiscal = $${params.length}`);
  }
  if (ubigeo) {
    params.push(ubigeo);
    conditions.push(`e.ubigeo = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`t.departamento = $${params.length}`);
  }
  if (metaDepartamento) {
    params.push(metaDepartamento.toUpperCase());
    conditions.push(`b.meta_departamento = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Columna real resuelta por el mapa fijo GROUP_BY_COLUMNS, nunca por el
  // texto crudo del query param, para no abrir una inyección SQL por
  // nombre de columna (mismo criterio que DQ-06 en infobras).
  const column = GROUP_BY_COLUMNS[groupBy as keyof typeof GROUP_BY_COLUMNS];
  const { rows } = await pool.query(
    `${LATEST_BUDGET_CTE}
     SELECT ${column} AS grupo,
            COUNT(*) AS filas,
            SUM(b.pia) AS pia,
            SUM(b.pim) AS pim,
            SUM(b.devengado) AS devengado,
            ARRAY_AGG(DISTINCT b.anio_fiscal) AS anios_fiscales
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     ${where}
     GROUP BY ${column}
     ORDER BY devengado DESC`,
    params
  );

  const porGrupo = rows.map((r) => ({
    grupo: r.grupo,
    filas: Number(r.filas),
    pia: Number(r.pia),
    pim: Number(r.pim),
    devengado: Number(r.devengado),
    avancePct: avancePct({ pim: Number(r.pim), devengado: Number(r.devengado) }),
  }));

  // DQ-16: esta query SUMA pia/pim/devengado — a diferencia de GET /api/execution
  // (que solo lista filas), mezclar años fiscales acá infla el total
  // directamente, no solo duplica filas. Sin `anio` explícito, se advierte si
  // algún grupo mezcla más de un año fiscal (LATEST_BUDGET_CTE no colapsa
  // anio_fiscal en su dedupe).
  const aniosFiscalesUsados = [...new Set(rows.flatMap((r) => r.anios_fiscales as number[]))].sort();

  res.json({
    groupBy,
    totalFilas: porGrupo.reduce((acc, g) => acc + g.filas, 0),
    totalPia: porGrupo.reduce((acc, g) => acc + g.pia, 0),
    totalPim: porGrupo.reduce((acc, g) => acc + g.pim, 0),
    totalDevengado: porGrupo.reduce((acc, g) => acc + g.devengado, 0),
    porGrupo,
    aniosFiscalesUsados,
    advertenciaMultiAnio:
      !anio && aniosFiscalesUsados.length > 1
        ? `Los totales mezclan ${aniosFiscalesUsados.length} años fiscales (${aniosFiscalesUsados.join(", ")}) porque no se pasó \`anio\`. Cada total está sumado a través de esos años, no de un solo año fiscal.`
        : null,
    fuente: { dataset: "MEF - Presupuesto y ejecución de gasto" },
  });
}));

executionRouter.get("/:entityCode", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.anio_fiscal,
            b.pia, b.pim, b.devengado, b.fecha_corte, rb.resource_id, rb.fetched_at,
            b.generica, b.generica_nombre
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
     WHERE b.entity_code = $1
     ORDER BY b.anio_fiscal DESC`,
    [req.params.entityCode]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Entidad no encontrada en los datos ingeridos." });
    return;
  }

  res.json({
    entityCode: req.params.entityCode,
    nombre: rows[0].nombre,
    nivelGobierno: rows[0].nivel_gobierno,
    linea_de_tiempo: rows.map((r) => ({
      funcion: r.funcion,
      generica: r.generica,
      genericaNombre: r.generica_nombre,
      anioFiscal: r.anio_fiscal,
      pia: Number(r.pia),
      pim: Number(r.pim),
      devengado: Number(r.devengado),
      avancePct: avancePct({ pim: Number(r.pim), devengado: Number(r.devengado) }),
      fechaCorte: r.fecha_corte,
      fuente: { dataset: "MEF - Presupuesto y ejecución de gasto", resourceId: r.resource_id, extraidoEl: r.fetched_at },
    })),
    coberturaTemporal: {
      estado: "PARCIAL",
      cortesUsados: [...new Set(rows.map((r) => String(r.fecha_corte)))].map((fechaCorte) => ({ fechaCorte })),
    },
  });
}));
