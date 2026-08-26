import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import {
  getPilotDepartment,
  isPilotDepartment,
  PILOT_DEPARTMENT_NAMES,
} from "../lib/pilot-departments.js";
import { loadMaxAnioEjecucion } from "../lib/indicators/ceplan-national.js";
import { loadPlanBudgetAlignment } from "../lib/indicators/plan-budget-alignment.js";

export const indicatorsPlanBudgetAlignmentRouter = Router();

const PbaQuerySchema = z.object({
  departamento: z.string().min(1),
  anio: z.coerce.number().int().min(2009).max(2100).optional(),
});

indicatorsPlanBudgetAlignmentRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(PbaQuerySchema, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase().trim();
    if (!isPilotDepartment(departamento)) {
      res.status(400).json({
        error: "Departamento fuera del piloto ALSOL Fase 2.",
        departamentosPermitidos: PILOT_DEPARTMENT_NAMES,
      });
      return;
    }

    const pilot = getPilotDepartment(departamento);
    const anio = parsed.anio ?? (await loadMaxAnioEjecucion()) ?? new Date().getFullYear();
    const alignment = await loadPlanBudgetAlignment(departamento, anio);
    const generadoEl = new Date().toISOString();

    res.json({
      matcher: "heuristica_dimension_v1",
      cobertura: alignment.gastoDevengadoTotal > 0 ? "PARCIAL" : "INCOMPLETA",
      restriccion: alignment.restriccion,
      dependencias: [{ app: "radar-ejecucion", ok: alignment.gastoDevengadoTotal > 0 }],
      corte: { generadoEl, anio },
      departamento,
      ubigeoPrefijo: pilot?.ubigeoPrefix ?? null,
      mapeoVersion: alignment.mapeoVersion,
      gastoDevengadoTotal: alignment.gastoDevengadoTotal,
      dimensiones: alignment.dimensiones,
    });
  })
);
