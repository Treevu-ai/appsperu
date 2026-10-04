import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { CrossAppUnavailableError } from "../lib/cross-app-pool.js";
import { cruzarProyectosInfobras, cruzarProyectoInfobrasPorId } from "../crossref/infobras-matcher.js";

export const crucesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const DEFAULT_PERIODO = 2026;

const CruceInfobrasQuerySchema = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD").describe("Departamento (ej. LA LIBERTAD)"),
  umbral_score: z.coerce.number().min(0).max(1).default(0.3).describe("Umbral mínimo de score (0.0-1.0)"),
  periodo: z.coerce.number().int().min(1900).max(2999).default(DEFAULT_PERIODO).describe("Periodo legislativo (per_par_id)"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const CruceInfobrasProyectoParamsSchema = z.object({
  periodo: z.coerce.number().int().describe("perParId del proyecto"),
  numero: z.coerce.number().int().describe("pleyNum del proyecto"),
});

const CruceInfobrasProyectoQuerySchema = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD").describe("Departamento"),
  umbral_score: z.coerce.number().min(0).max(1).default(0.3).describe("Umbral mínimo de score"),
});

const FUENTE = {
  dataset: "Congreso de la República - Proyectos de Ley × INFOBRAS - Obras Públicas",
  nota: "Cruce keyword-based sin IA. Score de match indica palabras clave coincidentes del título del proyecto en el nombre de la obra.",
};

/**
 * Traduce un CrossAppUnavailableError a 503 en vez de dejarlo subir como 500.
 */
function isCruceDegradado(error: unknown): boolean {
  return error instanceof CrossAppUnavailableError;
}

/**
 * Nombre público de la app en el mensaje de degradación. `appName` es la clave
 * interna del pool ("infobras"); el usuario-facing es "INFOBRAS", igual que en
 * el handler MCP — si divergen, el mismo fallo se lee distinto según la capa.
 */
function nombreAppDegradada(error: unknown): string {
  return error instanceof CrossAppUnavailableError ? error.appName.toUpperCase() : "la app cruzada";
}

/**
 * Cruce proyectos de ley con obras públicas (INFOBRAS).
 * GET /api/cruces/proyectos-infobras?departamento=LA LIBERTAD&umbral_score=0.3&periodo=2026
 */
crucesRouter.get(
  "/proyectos-infobras",
  asyncHandler(async (req, res) => {
    const parsed = CruceInfobrasQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parámetros inválidos", details: parsed.error.issues });
      return;
    }
    const { departamento, umbral_score, periodo, limit, offset } = parsed.data;

    try {
      const { cruces, truncated } = await cruzarProyectosInfobras(departamento, umbral_score, periodo);

      // Paginación en memoria: el cruce ya está acotado por OBRAS_CANDIDATAS_LIMIT
      // obras candidatas en la única query a INFOBRAS.
      const total = cruces.length;
      const paginated = cruces.slice(offset, offset + limit);

      res.json({
        total,
        limit,
        offset,
        periodo,
        hasMore: offset + paginated.length < total,
        truncated,
        resultados: paginated,
        fuente: FUENTE,
      });
    } catch (error) {
      if (isCruceDegradado(error)) {
        res.status(503).json({
          error: "Cruce no disponible",
          detalle: `${nombreAppDegradada(error)} no está accesible`,
        });
        return;
      }
      throw error;
    }
  })
);

/**
 * Cruce un proyecto específico con obras INFOBRAS.
 * GET /api/cruces/proyectos-infobras/:periodo/:numero?departamento=LA LIBERTAD
 */
crucesRouter.get(
  "/proyectos-infobras/:periodo/:numero",
  asyncHandler(async (req, res) => {
    const parsedParams = CruceInfobrasProyectoParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Parámetros inválidos", details: parsedParams.error.issues });
      return;
    }

    const parsedQuery = CruceInfobrasProyectoQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({ error: "Parámetros inválidos", details: parsedQuery.error.issues });
      return;
    }

    const { periodo, numero } = parsedParams.data;
    const { departamento, umbral_score } = parsedQuery.data;

    try {
      const { cruces, truncated } = await cruzarProyectoInfobrasPorId(periodo, numero, departamento, umbral_score);

      if (cruces.length === 0) {
        res.status(404).json({
          error: "No se encontraron obras que matcheen este proyecto",
          periodo,
          numero,
          departamento,
          umbral_score,
        });
        return;
      }

      res.json({
        proyecto: { perParId: periodo, pleyNum: numero },
        departamento,
        umbral_score,
        total: cruces.length,
        truncated,
        resultados: cruces,
        fuente: FUENTE,
      });
    } catch (error) {
      if (isCruceDegradado(error)) {
        res.status(503).json({
          error: "Cruce no disponible",
          detalle: `${nombreAppDegradada(error)} no está accesible`,
        });
        return;
      }
      throw error;
    }
  })
);