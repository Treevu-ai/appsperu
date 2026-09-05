import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { fetchDenunciasByProvincia, fetchEjecucionByUbigeo, type DependencyStatus, type DenunciaAgg } from "../lib/api-clients.js";

export const denominadoresRouter = Router();

const ProvinciaQuery = z.object({
  departamento: z.string().min(1).default("LA LIBERTAD"),
  provincia: z.string().min(1).default("TRUJILLO"),
});

const RatesQuery = ProvinciaQuery.extend({
  anio: z.coerce.number().int().min(2015).max(2100).default(2024),
  por: z.coerce.number().int().min(1).max(100000).default(1000),
  metrica: z.enum(["denuncias"]).default("denuncias"),
});

denominadoresRouter.get(
  "/poblacion",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProvinciaQuery, req.query, res);
    if (!parsed) return;

    const { rows } = await pool.query(
      `SELECT ubigeo, departamento, provincia, distrito, poblacion, fuente, vintage, observed_at
       FROM population_by_ubigeo
       WHERE upper(departamento) = upper($1) AND upper(provincia) = upper($2)
       ORDER BY distrito`,
      [parsed.departamento, parsed.provincia]
    );

    res.json({
      departamento: parsed.departamento.toUpperCase(),
      provincia: parsed.provincia.toUpperCase(),
      resultados: rows.map((row) => ({
        ubigeo: row.ubigeo,
        distrito: row.distrito,
        poblacion: Number(row.poblacion),
        fuente: row.fuente,
        vintage: row.vintage,
        fechaObservacion: row.observed_at,
      })),
      limitacion:
        "Población Censo 2017; no refleja crecimiento posterior. Usar solo para tasas comparables con vintage declarado.",
    });
  })
);

denominadoresRouter.get(
  "/tasas",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(RatesQuery, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const provincia = parsed.provincia.toUpperCase();

    const { rows: poblacionRows } = await pool.query<{
      ubigeo: string;
      distrito: string;
      poblacion: string;
      fuente: string;
      vintage: string;
    }>(
      `SELECT ubigeo, distrito, poblacion, fuente, vintage
       FROM population_by_ubigeo
       WHERE upper(departamento) = $1 AND upper(provincia) = $2`,
      [departamento, provincia]
    );

    if (poblacionRows.length === 0) {
      res.status(404).json({ error: "Sin denominadores de población para la provincia solicitada." });
      return;
    }

    let denunciasAgg: DenunciaAgg[] = [];
    let dependency: DependencyStatus | null = null;
    if (parsed.metrica === "denuncias") {
      try {
        const fetched = await fetchDenunciasByProvincia(departamento, provincia, parsed.anio);
        denunciasAgg = fetched.denuncias;
        dependency = fetched.dependency;
      } catch (error) {
        const dep = (error as { dependency?: DependencyStatus }).dependency;
        if (dep) {
          res.status(502).json({
            error: "seguridad-ciudadana no disponible para calcular tasas.",
            dependencia: dep,
          });
          return;
        }
        throw error;
      }
    }

    const volumenByUbigeo = new Map<string, number>();
    for (const row of denunciasAgg) {
      volumenByUbigeo.set(row.ubigeo, (volumenByUbigeo.get(row.ubigeo) ?? 0) + row.cantidad);
    }

    const resultados = poblacionRows.map((row) => {
      const volumen = volumenByUbigeo.get(row.ubigeo) ?? 0;
      const poblacion = Number(row.poblacion);
      const tasa = poblacion > 0 ? Math.round((volumen / poblacion) * parsed.por * 100) / 100 : null;
      return {
        ubigeo: row.ubigeo,
        distrito: row.distrito,
        volumen,
        poblacion,
        tasaPor: parsed.por,
        tasa,
        denominador: { fuente: row.fuente, vintage: row.vintage },
        estadoDenominador: poblacion > 0 ? "POBLACION_CENSO_2017" : "SIN_DENOMINADOR",
      };
    });

    res.json({
      departamento,
      provincia,
      anio: parsed.anio,
      metrica: parsed.metrica,
      por: parsed.por,
      dependencias: dependency ? [dependency] : [],
      resultados,
      limitacion:
        "Tasa = volumen anual / población Censo 2017 × factor. No implica riesgo relativo ajustado por subregistro o modalidad.",
    });
  })
);

type TierName = "GRANDE" | "MEDIANO" | "PEQUEÑO";

/** Terciles de tamaño sobre el conjunto consultado (hoy, siempre los 11
 * distritos de la provincia de Trujillo — única cobertura real de
 * `population_by_ubigeo`). Con un universo tan chico, deciles no tendrían
 * sentido; terciles de ~3-4 distritos cada uno es lo único razonable. */
function assignTiers<T extends { poblacion: number }>(rows: T[]): (T & { tier: TierName })[] {
  const sorted = [...rows].sort((a, b) => b.poblacion - a.poblacion);
  const tierSize = Math.ceil(sorted.length / 3);
  return sorted.map((row, index) => {
    const tier: TierName = index < tierSize ? "GRANDE" : index < tierSize * 2 ? "MEDIANO" : "PEQUEÑO";
    return { ...row, tier };
  });
}

/**
 * Benchmark de % de avance de ejecución presupuestal entre distritos de
 * tamaño similar (tercil de población). Dos filtros deliberados, ambos
 * verificados contra datos reales antes de escribir este código:
 *
 * 1. Solo `nivelGobierno === "GOBIERNOS LOCALES"` de `filasSede`. Sumar
 *    PIM/devengado por ubigeo sin este filtro mezcla la municipalidad con
 *    el Gobierno Regional que tiene su sede en el mismo distrito — para
 *    Trujillo (130101), de 13 entidades reales solo 1 es una
 *    municipalidad; las otras 12 son "REGION LA LIBERTAD-..." con PIM
 *    combinado >S/2,500M. Sin el filtro, el "avance" de Trujillo
 *    compararía peras con manzanas contra el resto de distritos.
 * 2. Nunca `filasNacionalDirigido` — mismo criterio que la
 *    `advertenciaGasto` ya documentada en `routes/crossref.ts` (mezclar
 *    ejecución por sede con gasto nacional dirigido a un departamento es
 *    el error más común en lecturas territoriales de este dataset).
 *
 * PIM=0 con devengado>0 es un caso real de la fuente (visto en
 * Municipalidad Provincial de Trujillo) — se expone `avancePct: null` +
 * `avancePctIndefinido: true`, no una división por cero.
 */
denominadoresRouter.get(
  "/benchmark-ejecucion",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ProvinciaQuery, req.query, res);
    if (!parsed) return;

    const departamento = parsed.departamento.toUpperCase();
    const provincia = parsed.provincia.toUpperCase();

    const { rows: poblacionRows } = await pool.query<{ ubigeo: string; distrito: string; poblacion: string }>(
      `SELECT ubigeo, distrito, poblacion FROM population_by_ubigeo
       WHERE upper(departamento) = $1 AND upper(provincia) = $2`,
      [departamento, provincia]
    );

    if (poblacionRows.length === 0) {
      res.status(404).json({ error: "Sin denominadores de población para la provincia solicitada." });
      return;
    }

    let ejecuciones: Array<{ ubigeo: string; distrito: string; poblacion: number; pim: number; devengado: number }>;
    let dependency: DependencyStatus | null = null;
    try {
      const fetched = await Promise.all(
        poblacionRows.map(async (row) => {
          const { filasSede, dependency: dep } = await fetchEjecucionByUbigeo(row.ubigeo, departamento);
          const locales = filasSede.filter((r) => r.nivelGobierno === "GOBIERNOS LOCALES");
          return {
            ubigeo: row.ubigeo,
            distrito: row.distrito,
            poblacion: Number(row.poblacion),
            pim: locales.reduce((sum, r) => sum + r.pim, 0),
            devengado: locales.reduce((sum, r) => sum + r.devengado, 0),
            dependency: dep,
          };
        })
      );
      dependency = fetched[0]?.dependency ?? null;
      ejecuciones = fetched.map(({ dependency: _dep, ...rest }) => rest);
    } catch (error) {
      const dep = (error as { dependency?: DependencyStatus }).dependency;
      if (dep) {
        res.status(502).json({ error: "radar-ejecucion no disponible para calcular el benchmark.", dependencia: dep });
        return;
      }
      throw error;
    }

    const withTiers = assignTiers(ejecuciones).map((row) => ({
      ...row,
      avancePctIndefinido: row.pim === 0,
      avancePct: row.pim > 0 ? Math.round((row.devengado / row.pim) * 10000) / 100 : null,
    }));

    const resultados = (["GRANDE", "MEDIANO", "PEQUEÑO"] as TierName[]).flatMap((tier) => {
      const enTier = withTiers
        .filter((r) => r.tier === tier)
        .sort((a, b) => (b.avancePct ?? -Infinity) - (a.avancePct ?? -Infinity));
      const tamanoTier = enTier.length;
      return enTier.map((row, index) => ({
        ubigeo: row.ubigeo,
        distrito: row.distrito,
        poblacion: row.poblacion,
        tier: row.tier,
        pim: row.pim,
        devengado: row.devengado,
        avancePct: row.avancePct,
        avancePctIndefinido: row.avancePctIndefinido,
        posicionEnTier: index + 1,
        tamanoTier,
        percentilEnTier: tamanoTier > 1 ? Math.round(((tamanoTier - (index + 1)) / (tamanoTier - 1)) * 100) : null,
      }));
    });

    res.json({
      departamento,
      provincia,
      dependencias: dependency ? [dependency] : [],
      resultados,
      limitacion:
        "Compara solo GOBIERNOS LOCALES (excluye Gobierno Regional/Nacional con sede en el mismo distrito) y solo ejecución por sede propia (excluye gasto nacional dirigido). Terciles de tamaño calculados sobre la cobertura real de population_by_ubigeo (hoy, solo la provincia de Trujillo, Censo 2017) — no es un catálogo nacional.",
    });
  })
);
