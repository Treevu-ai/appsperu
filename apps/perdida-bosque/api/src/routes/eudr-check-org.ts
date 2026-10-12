import { Router } from "express";
import { z } from "zod";
import { identidadFiscalPool } from "../db/identidad-fiscal-pool.js";
import { evaluarCorteEudr, type GeoJSONPolygon } from "../lib/gfw-client.js";
import { preFiltroGeobosques } from "../lib/geobosques-filter.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const eudrCheckOrgRouter = Router();

const QuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
});

interface EudrParcelaRow {
  parcela_id: number;
  codigo_parcela: string;
  tipo_geometria: "PUNTO" | "POLIGONO";
  latitud: string | number | null;
  longitud: string | number | null;
  poligono_geojson: GeoJSONPolygon | null;
  area_ha: string | number;
}

/**
 * Un PUNTO no es una geometría válida para GFW (exige Polygon/MultiPolygon)
 * ni para el pre-filtro de Geobosques (ST_Intersects contra polígonos de
 * pérdida). Se infla a un cuadrado chico (~110m de lado) centrado en el
 * punto — igual que se hizo a mano para el caso de Ongón, aquí ya
 * automatizado.
 */
function geometriaDeParcela(p: EudrParcelaRow): GeoJSONPolygon {
  if (p.tipo_geometria === "POLIGONO" && p.poligono_geojson) {
    return p.poligono_geojson;
  }
  const lat = Number(p.latitud);
  const lon = Number(p.longitud);
  const d = 0.0005;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon - d, lat - d],
        [lon + d, lat - d],
        [lon + d, lat + d],
        [lon - d, lat + d],
        [lon - d, lat - d],
      ],
    ],
  };
}

/**
 * Due diligence EUDR para TODAS las parcelas de una organización (RUC) de
 * una sola llamada. Usa el pre-filtro de Geobosques por parcela para no
 * gastar cuota de GFW en las que ya se pueden resolver gratis (ver
 * gfw-client.evaluarCorteEudr) — importante porque GFW tiene límite de
 * tasa y una organización puede tener decenas de parcelas.
 */
eudrCheckOrgRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { ruc } = parsed;

    const { rows: parcelas } = await identidadFiscalPool.query<EudrParcelaRow>(
      `SELECT parcela_id, codigo_parcela, tipo_geometria, latitud, longitud, poligono_geojson, area_ha
       FROM eudr_parcela WHERE ruc = $1 ORDER BY codigo_parcela`,
      [ruc]
    );

    const resultados = [];
    let resueltasConGeobosques = 0;
    let resueltasConGfw = 0;

    for (const p of parcelas) {
      const geometry = geometriaDeParcela(p);
      const preFiltro = await preFiltroGeobosques(geometry);
      const resultado = await evaluarCorteEudr(geometry, preFiltro);

      if (resultado.resueltoCon === "geobosques") resueltasConGeobosques++;
      else resueltasConGfw++;

      resultados.push({
        parcelaId: p.parcela_id,
        codigoParcela: p.codigo_parcela,
        areaHa: Number(p.area_ha),
        ...resultado,
      });
    }

    res.json({
      ruc,
      totalParcelas: parcelas.length,
      resueltasConGeobosques,
      resueltasConGfw,
      algunaConPerdidaPostCorte: resultados.some((r) => !r.cumpleCorteEudr),
      resultados,
      corte: "2020-12-31",
    });
  })
);
