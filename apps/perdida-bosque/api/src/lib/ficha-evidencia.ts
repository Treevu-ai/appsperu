import { identidadFiscalPool } from "../db/identidad-fiscal-pool.js";
import { evaluarCorteEudr, type GeoJSONPolygon, type ResultadoEudr } from "./gfw-client.js";
import { preFiltroGeobosques } from "./geobosques-filter.js";
import { evaluarLegalidad, type RiesgoLegalidad } from "./legalidad.js";

interface EudrParcelaRow {
  parcela_id: number;
  codigo_parcela: string;
  tipo_geometria: "PUNTO" | "POLIGONO";
  latitud: string | number | null;
  longitud: string | number | null;
  poligono_geojson: GeoJSONPolygon | null;
  area_ha: string | number;
  cumple_geolocalizacion_eudr: boolean;
}

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

export interface ParcelaEvidencia {
  parcelaId: number;
  codigoParcela: string;
  areaHa: number;
  geolocalizacionCumpleArt9: boolean;
  deforestacion: ResultadoEudr;
}

export interface FichaEvidenciaEudr {
  ruc: string;
  razonSocial: string | null;
  fechaGeneracion: string;
  corte: "2020-12-31";
  parcelas: ParcelaEvidencia[];
  legalidad: RiesgoLegalidad;
  veredicto: {
    totalParcelas: number;
    parcelasConGeolocalizacionValida: number;
    parcelasConPerdidaPostCorte: number;
    legalidadEnRevision: boolean;
    listoParaDeclaracionDds: boolean;
  };
}

/**
 * Compone la ficha de evidencia EUDR completa de una organización: quién
 * es (razón social), sus parcelas (geolocalización + deforestación por
 * año), y su riesgo de legalidad. Es el documento que una empresa
 * presentaría como respaldo de su declaración de diligencia debida (DDS),
 * no solo una respuesta de API — de ahí el campo `veredicto`.
 *
 * `listoParaDeclaracionDds` es deliberadamente estricto: exige que HAYA
 * al menos una parcela, que todas tengan geolocalización válida, que
 * ninguna tenga pérdida post-corte, y que la legalidad no esté en
 * revisión. Cualquier duda real debe bloquear el veredicto positivo, no
 * dar el beneficio de la duda.
 */
export async function evaluarFichaEudr(ruc: string): Promise<FichaEvidenciaEudr> {
  const [{ rows: contribRows }, { rows: parcelaRows }, legalidad] = await Promise.all([
    identidadFiscalPool.query<{ razon_social: string }>(
      `SELECT razon_social FROM contribuyentes WHERE ruc = $1`,
      [ruc]
    ),
    identidadFiscalPool.query<EudrParcelaRow>(
      `SELECT parcela_id, codigo_parcela, tipo_geometria, latitud, longitud, poligono_geojson,
              area_ha, cumple_geolocalizacion_eudr
       FROM eudr_parcela WHERE ruc = $1 ORDER BY codigo_parcela`,
      [ruc]
    ),
    evaluarLegalidad(ruc),
  ]);

  const parcelas: ParcelaEvidencia[] = [];
  for (const p of parcelaRows) {
    const geometry = geometriaDeParcela(p);
    const preFiltro = await preFiltroGeobosques(geometry);
    const deforestacion = await evaluarCorteEudr(geometry, preFiltro);
    parcelas.push({
      parcelaId: p.parcela_id,
      codigoParcela: p.codigo_parcela,
      areaHa: Number(p.area_ha),
      geolocalizacionCumpleArt9: p.cumple_geolocalizacion_eudr,
      deforestacion,
    });
  }

  const parcelasConGeolocalizacionValida = parcelas.filter((p) => p.geolocalizacionCumpleArt9).length;
  const parcelasConPerdidaPostCorte = parcelas.filter((p) => !p.deforestacion.cumpleCorteEudr).length;
  const legalidadEnRevision = legalidad.nivel === "REVISAR";

  return {
    ruc,
    razonSocial: contribRows[0]?.razon_social ?? null,
    fechaGeneracion: new Date().toISOString(),
    corte: "2020-12-31",
    parcelas,
    legalidad,
    veredicto: {
      totalParcelas: parcelas.length,
      parcelasConGeolocalizacionValida,
      parcelasConPerdidaPostCorte,
      legalidadEnRevision,
      listoParaDeclaracionDds:
        parcelas.length > 0 &&
        parcelasConGeolocalizacionValida === parcelas.length &&
        parcelasConPerdidaPostCorte === 0 &&
        !legalidadEnRevision,
    },
  };
}
