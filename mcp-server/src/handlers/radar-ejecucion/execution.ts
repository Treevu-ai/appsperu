import type { NeonPool, NeonRow } from "../../db/neon-pool.js";
import { LATEST_BUDGET_CTE } from "../../db/latest-budget.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface BudgetRow extends NeonRow {
  entity_code: string;
  nombre: string;
  nivel_gobierno: string;
  funcion: string;
  anio_fiscal: number;
  pia: number;
  pim: number;
  devengado: number;
  fecha_corte: string;
  meta_departamento: string | null;
  resource_id: number;
  generica: string | null;
  generica_nombre: string | null;
  provincia: string | null;
  distrito: string | null;
  fetched_at: string | null;
}

interface ResumenRow extends NeonRow {
  grupo: string;
  filas: number | string;
  pia: number | string;
  pim: number | string;
  devengado: number | string;
  anios_fiscales: number[];
}

function avancePct(pim: number, devengado: number): number | null {
  if (pim <= 0) return null;
  return Math.round((devengado / pim) * 10000) / 100;
}

/**
 * Handler para `radar_ejecucion_execution` — lista de ejecución presupuestal
 * por entidad + función + año fiscal.
 *
 * El SQL es idéntico al de `apps/radar-ejecucion/api/src/routes/execution.ts`,
 * con placeholders `$n` de Postgres. La única diferencia es que en vez de un
 * `pool.query` recibe un `NeonPool`: mismo dialecto, distinto transporte.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const nivel = args.nivel as string | undefined;
  const funcion = args.funcion as string | undefined;
  const anio = args.anio as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const departamento = args.departamento as string | undefined;
  const metaDepartamento = args.metaDepartamento as string | undefined;
  const generica = args.generica as string | undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : 1000, 5000);
  const offset = args.offset ? Number(args.offset) : 0;

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

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const countQuery = `
    ${LATEST_BUDGET_CTE}
    SELECT COUNT(*) AS total
    FROM latest_budget b
    JOIN entities e ON e.entity_code = b.entity_code
    JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
    LEFT JOIN territories t ON t.ubigeo = e.ubigeo
    ${where}`;

  const countResult = await db.query<{ total: number }>(countQuery, params);
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataQuery = `
    ${LATEST_BUDGET_CTE}
    SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.anio_fiscal,
           b.pia, b.pim, b.devengado, b.fecha_corte, b.meta_departamento, rb.resource_id, b.generica, b.generica_nombre,
           t.provincia, t.distrito
    FROM latest_budget b
    JOIN entities e ON e.entity_code = b.entity_code
    JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
    LEFT JOIN territories t ON t.ubigeo = e.ubigeo
    ${where}
    ORDER BY b.devengado DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  const dataResult = await db.query<BudgetRow>(dataQuery, [...params, limit, offset]);
  const rows = dataResult.rows;

  const cortesUsados = [...new Map(rows.map((r) => [
    `${r.meta_departamento ?? "SEDE_EJECUTORA"}:${r.fecha_corte}`,
    {
      particion: r.meta_departamento ? `META_DEPARTAMENTO:${r.meta_departamento}` : "SEDE_EJECUTORA",
      fechaCorte: r.fecha_corte,
    },
  ])).values()];

  const aniosFiscalesUsados = [...new Set(rows.map((r) => r.anio_fiscal))].sort();

  const resultados = rows.map((r) => ({
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
    avancePct: avancePct(Number(r.pim), Number(r.devengado)),
    fechaCorte: r.fecha_corte,
    fuente: { dataset: "MEF - Presupuesto y ejecución de gasto", resourceId: r.resource_id },
  }));

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      coberturaTemporal: {
        estado: "PARCIAL" as const,
        cortesUsados,
        aniosFiscalesUsados,
        advertenciaMultiAnio:
          aniosFiscalesUsados.length > 1
            ? `Esta página mezcla ${aniosFiscalesUsados.length} años fiscales (${aniosFiscalesUsados.join(", ")}). Filtra por \`anio\` si necesitas un solo año fiscal — sumar sin ese filtro infla cualquier total agregado.`
            : null,
        limitacion: "Cada observación usa su último corte disponible; los cortes pueden diferir entre particiones de cobertura.",
      },
      resultados,
    },
  };
}

/** Handler para `radar_ejecucion_execution_by_entity` — /api/execution/{entityCode} */
export async function byEntity(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const entityCode = args.entityCode as string;

  const query = `
    ${LATEST_BUDGET_CTE}
    SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.anio_fiscal,
           b.pia, b.pim, b.devengado, b.fecha_corte, rb.resource_id, rb.fetched_at,
           b.generica, b.generica_nombre
    FROM latest_budget b
    JOIN entities e ON e.entity_code = b.entity_code
    JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
    WHERE b.entity_code = $1
    ORDER BY b.anio_fiscal DESC`;

  const result = await db.query<BudgetRow>(query, [entityCode]);
  const rows = result.rows;

  if (rows.length === 0) {
    return { status: 404, body: { error: "Entidad no encontrada en los datos ingeridos." } };
  }

  return {
    status: 200,
    body: {
      entityCode,
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
        avancePct: avancePct(Number(r.pim), Number(r.devengado)),
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MEF - Presupuesto y ejecución de gasto", resourceId: r.resource_id, extraidoEl: r.fetched_at },
      })),
      coberturaTemporal: {
        estado: "PARCIAL" as const,
        cortesUsados: [...new Set(rows.map((r) => String(r.fecha_corte)))].map((fechaCorte) => ({ fechaCorte })),
      },
    },
  };
}

/**
 * Handler para `radar_ejecucion_execution_resumen` — agregación por función o genérica
 * (DQ-08, 2026-09-08). `groupBy` es requerido (funcion|generica).
 * Sin `anio`, los totales agregados pueden mezclar más de un año fiscal — la
 * respuesta expone `aniosFiscalesUsados`/`advertenciaMultiAnio` (DQ-16).
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const groupBy = args.groupBy as string | undefined;
  const nivel = args.nivel as string | undefined;
  const anio = args.anio as string | undefined;
  const ubigeo = args.ubigeo as string | undefined;
  const departamento = args.departamento as string | undefined;
  const metaDepartamento = args.metaDepartamento as string | undefined;

  if (!groupBy || !["funcion", "generica"].includes(groupBy)) {
    return { status: 400, body: { error: "groupBy debe ser 'funcion' o 'generica'" } };
  }

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

  const column = groupBy === "funcion" ? "b.funcion" : "b.generica";

  const { rows } = await db.query<ResumenRow>(
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
    avancePct: avancePct(Number(r.pim), Number(r.devengado)),
  }));

  const aniosFiscalesUsados = [...new Set(rows.flatMap((r) => r.anios_fiscales as number[]))].sort();

  return {
    status: 200,
    body: {
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
    },
  };
}
