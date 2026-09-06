import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const residuosRouter = Router();

const ResiduosQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  provincia: z.string().min(1).optional(),
  distrito: z.string().min(1).optional(),
  ubigeo: z.string().regex(/^\d{6}$/).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

residuosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(ResiduosQuerySchema, req.query, res);
    if (!parsed) return;
    const { departamento, provincia, distrito, ubigeo, anio } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const addIlike = (column: string, value: string) => {
      params.push(`%${value}%`);
      conditions.push(`${column} ILIKE $${params.length}`);
    };

    if (departamento) addIlike("r.departamento", departamento);
    if (provincia) addIlike("r.provincia", provincia);
    if (distrito) addIlike("r.distrito", distrito);
    if (ubigeo) {
      params.push(ubigeo);
      conditions.push(`r.ubigeo = $${params.length}`);
    }
    if (anio) {
      params.push(anio);
      conditions.push(`r.anio = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT r.ubigeo, r.anio, r.departamento, r.provincia, r.distrito, r.tipo_municipalidad,
              r.poblacion_total, r.generacion_percapita_dom, r.generacion_dom_urbana_tanio,
              r.generacion_mun_tanio, r.generacion_mun_tdia, r.fecha_corte, rb.fetched_at
       FROM residuos_solidos_municipales r
       JOIN raw_residuos_solidos_batches rb ON rb.id = r.source_batch_id
       ${where}
       ORDER BY r.anio DESC, r.departamento, r.provincia, r.distrito
       LIMIT 200`,
      params
    );

    res.json({
      resultados: rows.map((r) => ({
        ubigeo: r.ubigeo,
        anio: r.anio,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipoMunicipalidad: r.tipo_municipalidad,
        poblacionTotal: r.poblacion_total,
        generacionPerCapitaDomKgDia: r.generacion_percapita_dom === null ? null : Number(r.generacion_percapita_dom),
        generacionDomUrbanaToneladasAnio: r.generacion_dom_urbana_tanio === null ? null : Number(r.generacion_dom_urbana_tanio),
        generacionMunicipalToneladasAnio: r.generacion_mun_tanio === null ? null : Number(r.generacion_mun_tanio),
        generacionMunicipalToneladasDia: r.generacion_mun_tdia === null ? null : Number(r.generacion_mun_tdia),
        fechaCorte: r.fecha_corte,
        fuente: { dataset: "MINAM - Generación anual de residuos sólidos domiciliarios y municipales (SIGERSOL)", extraidoEl: r.fetched_at },
      })),
    });
  })
);
