import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { avancePct } from "../ingest/normalize.js";
import { LATEST_BUDGET_CTE } from "../db/budget-coverage.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const executionRouter = Router();

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
});

executionRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(ExecutionQuerySchema, req.query, res);
  if (!parsed) return;
  const { nivel, funcion, anio, ubigeo, departamento, metaDepartamento, generica } = parsed;

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

  const { rows } = await pool.query(
    `${LATEST_BUDGET_CTE}
     SELECT b.entity_code, e.nombre, e.nivel_gobierno, b.funcion, b.anio_fiscal,
            b.pia, b.pim, b.devengado, b.fecha_corte, b.meta_departamento, rb.resource_id, b.generica, b.generica_nombre
     FROM latest_budget b
     JOIN entities e ON e.entity_code = b.entity_code
     JOIN raw_mef_batches rb ON rb.id = b.source_batch_id
     LEFT JOIN territories t ON t.ubigeo = e.ubigeo
     ${where}
     ORDER BY b.devengado DESC
     LIMIT 1000`,
    params
  );

  const cortesUsados = [...new Map(rows.map((r) => [
    `${r.meta_departamento ?? "SEDE_EJECUTORA"}:${r.fecha_corte}`,
    {
      particion: r.meta_departamento ? `META_DEPARTAMENTO:${r.meta_departamento}` : "SEDE_EJECUTORA",
      fechaCorte: r.fecha_corte,
    },
  ])).values()];

  res.json({
    coberturaTemporal: {
      estado: "PARCIAL",
      cortesUsados,
      limitacion: "Cada observación usa su último corte disponible; los cortes pueden diferir entre particiones de cobertura.",
    },
    resultados: rows.map((r) => ({
      entityCode: r.entity_code,
      nombre: r.nombre,
      nivelGobierno: r.nivel_gobierno,
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
