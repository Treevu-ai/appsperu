import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { CrossAppUnavailableError } from "../lib/cross-app-pool.js";
import {
  cruzarProyectosInfobras,
  cruzarProyectoInfobrasPorId,
  UMBRAL_SCORE_DEFAULT,
  MATCHED_MINIMO_DEFAULT,
} from "../crossref/infobras-matcher.js";
import {
  DEFAULT_DEPARTAMENTO,
  PERU_DEPARTAMENTOS,
  resolverDepartamento,
} from "../lib/departamentos.js";

export const crucesRouter = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const DEFAULT_PERIODO = 2026;

const CruceInfobrasQuerySchema = z.object({
  departamento: z.string().min(1).default(DEFAULT_DEPARTAMENTO).describe("Departamento (ej. LA LIBERTAD)"),
  umbral_score: z.coerce.number().min(0).max(1).default(UMBRAL_SCORE_DEFAULT).describe("Umbral mínimo de score (0.0-1.0)"),
  matched_minimo: z.coerce.number().int().min(1).max(20).default(MATCHED_MINIMO_DEFAULT)
    .describe("Mínimo de keywords coincidentes, además del umbral"),
  periodo: z.coerce.number().int().min(1900).max(2999).default(DEFAULT_PERIODO).describe("Periodo legislativo (per_par_id)"),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const CruceInfobrasProyectoParamsSchema = z.object({
  periodo: z.coerce.number().int().describe("perParId del proyecto"),
  numero: z.coerce.number().int().describe("pleyNum del proyecto"),
});

const CruceInfobrasProyectoQuerySchema = z.object({
  departamento: z.string().min(1).default(DEFAULT_DEPARTAMENTO).describe("Departamento"),
  umbral_score: z.coerce.number().min(0).max(1).default(UMBRAL_SCORE_DEFAULT).describe("Umbral mínimo de score"),
  matched_minimo: z.coerce.number().int().min(1).max(20).default(MATCHED_MINIMO_DEFAULT)
    .describe("Mínimo de keywords coincidentes, además del umbral"),
});

const FUENTE = {
  dataset: "Congreso de la República - Proyectos de Ley × INFOBRAS - Obras Públicas",
  nota: "Cruce keyword-based sin IA ni embeddings. matchScore es la fracción de keywords del título presentes en el nombre de la obra, con coincidencia por token completo: un score alto no prueba causalidad.",
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
 * Un departamento fuera del catálogo se rechaza con 400. Antes pasaba tal cual
 * a la query y devolvía 0 cruces sin error, idéntico a "ese departamento no
 * tiene obras"; el alias "P C DEL CALLAO" del XLSX de INFOBRAS cae en esa
 * ambigüedad y por eso se canonicaliza antes de comparar.
 */
function departamentoInvalido(departamento: string): string | null {
  if (resolverDepartamento(departamento)) return null;
  return `Departamento fuera del catálogo peruano: "${departamento}". Valores: ${PERU_DEPARTAMENTOS.join(", ")}`;
}

/**
 * Cruce proyectos de ley con obras públicas (INFOBRAS).
 * GET /api/cruces/proyectos-infobras?departamento=LA LIBERTAD&umbral_score=0.5&periodo=2026
 */
crucesRouter.get(
  "/proyectos-infobras",
  asyncHandler(async (req, res) => {
    const parsed = CruceInfobrasQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Parámetros inválidos", details: parsed.error.issues });
      return;
    }
    const { departamento, umbral_score, matched_minimo, periodo, limit, offset } = parsed.data;

    const invalido = departamentoInvalido(departamento);
    if (invalido) {
      res.status(400).json({ error: "Departamento inválido", detalle: invalido });
      return;
    }

    try {
      // El matcher pagina sobre el conjunto completo: `total` es el conteo real
      // y solo se hidratan los objetos de la página, así que ya no hace falta
      // acotar candidatas ni reportar truncamiento.
      const { total, cruces, hasMore } = await cruzarProyectosInfobras(departamento, {
        umbralScore: umbral_score,
        matchedMinimo: matched_minimo,
        periodo,
        limite: limit,
        offset,
      });

      res.json({
        total,
        limit,
        offset,
        periodo,
        hasMore,
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
    const { departamento, umbral_score, matched_minimo } = parsedQuery.data;

    const invalido = departamentoInvalido(departamento);
    if (invalido) {
      res.status(400).json({ error: "Departamento inválido", detalle: invalido });
      return;
    }

    try {
      const { total, cruces } = await cruzarProyectoInfobrasPorId(periodo, numero, departamento, {
        umbralScore: umbral_score,
        matchedMinimo: matched_minimo,
      });

      // Sin tope de candidatas, un 404 ya solo significa que ninguna obra
      // alcanzó el umbral: no hay un segundo caso que distinguir.
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
        total,
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