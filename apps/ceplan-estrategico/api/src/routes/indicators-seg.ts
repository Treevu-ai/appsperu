import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { CROSSREFEABLE_NIVELES_GOBIERNO } from "../ingest/field-mapping.js";
import {
  getPilotDepartment,
  isPilotDepartment,
  PILOT_DEPARTMENT_NAMES,
} from "../lib/pilot-departments.js";
import {
  anioFromMeasurementDate,
  buildNationalLevel,
  loadLatestCumpIndicators,
  loadMaxAnioEjecucion,
} from "../lib/indicators/ceplan-national.js";
import { loadDepartmentProxyMetrics } from "../lib/indicators/department-proxy.js";

export const indicatorsSegRouter = Router();

const SegQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  anio: z.coerce.number().int().min(2009).max(2100).optional(),
});

const NACIONAL_RESTRICCION =
  "SEG nacional CEPLAN = CUMP03% − CUMP02% por nivel de gobierno; no implica cobertura departamental.";

indicatorsSegRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(SegQuerySchema, req.query, res);
    if (!parsed) return;

    if (parsed.departamento) {
      const departamento = parsed.departamento.toUpperCase().trim();
      if (!isPilotDepartment(departamento)) {
        res.status(400).json({
          error: "Departamento fuera del piloto ALSOL Fase 2.",
          departamentosPermitidos: PILOT_DEPARTMENT_NAMES,
        });
        return;
      }

      const pilot = getPilotDepartment(departamento);
      const proxy = await loadDepartmentProxyMetrics(departamento, parsed.anio);
      const generadoEl = new Date().toISOString();

      res.json({
        matcher: "mef_infobras_departamento",
        cobertura: proxy?.segPp !== null ? "PARCIAL" : "INCOMPLETA",
        restriccion: proxy?.restriccion ?? "Sin datos MEF/INFOBRAS para calcular proxy departamental.",
        dependencias: proxy?.dependencias ?? [{ app: "radar-ejecucion", ok: false }],
        corte: { generadoEl, anio: proxy?.anio ?? parsed.anio ?? null },
        fuente: "radar-ejecucion+infobras",
        variante: "PROXY_DEPARTAMENTAL",
        departamento,
        ubigeoPrefijo: pilot?.ubigeoPrefix ?? null,
        ejecucionPresupuestalPct: proxy?.ejecucionPresupuestalPct ?? null,
        avanceFisicoMedioPct: proxy?.avanceFisicoMedioPct ?? null,
        segPp: proxy?.segPp ?? null,
        pim: proxy?.pim ?? null,
        devengado: proxy?.devengado ?? null,
        obrasConAvance: proxy?.obrasConAvance ?? 0,
      });
      return;
    }

    const [rows, anioEjecucion] = await Promise.all([loadLatestCumpIndicators(), loadMaxAnioEjecucion()]);
    const generadoEl = new Date().toISOString();
    const anioCeplan =
      anioFromMeasurementDate(rows[0]?.measurement_date) ??
      anioFromMeasurementDate(rows.find((row) => row.measurement_date)?.measurement_date);

    res.json({
      matcher: "nivel_gobierno_ceplan",
      cobertura: "NACIONAL",
      restriccion: NACIONAL_RESTRICCION,
      dependencias: [
        { app: "ceplan-estrategico", ok: rows.length > 0 },
        { app: "radar-ejecucion", ok: anioEjecucion !== null },
      ],
      corte: { generadoEl, anioCeplan, anioEjecucion },
      fuente: "ceplan+radar-ejecucion",
      resultados: [...CROSSREFEABLE_NIVELES_GOBIERNO].map((nivel) => {
        const item = buildNationalLevel(rows, nivel, anioEjecucion);
        return {
          nivelGobierno: item.nivelGobierno,
          variante: item.variante,
          anioCeplan: item.anioCeplan,
          anioEjecucion: item.anioEjecucion,
          cump02: item.cump02,
          cump03: item.cump03,
          segPp: item.segPp,
        };
      }),
    });
  })
);
