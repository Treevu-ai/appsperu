import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { fetchDenunciasByProvincia, type DependencyStatus, type DenunciaAgg } from "../lib/api-clients.js";

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
