import { pathToFileURL } from "node:url";
import { pool, connectSafe } from "../db/pool.js";
import { ringsToGeoJSON, getCapaName, layerUrl, TOTAL_LAYERS } from "./midagri-connector.js";

/**
 * Backfill de geometría para catastro_rural -- bug real encontrado en vivo
 * (2026-10-14): normalize-midagri.ts buscaba la geometría dentro de
 * `attributes` cuando en realidad viene como campo hermano de la feature
 * (`{ attributes: {...}, geometry: { rings: [...] } }`). Las 10 capas
 * (3.37M filas) quedaron con `geometry IS NULL` pese a que la ingesta
 * reportó éxito completo.
 *
 * Diseño deliberado: NO reusa paginación posicional (resultOffset) para
 * reanudar -- ese patrón ya causó un hueco real de 52,000 filas en
 * predio_rural por desalineación entre offset y conteo DISTINCT. En vez de
 * eso, este script pide a ArcGIS exactamente los `objectid` que todavía
 * tienen `geometry IS NULL` (vía el parámetro `objectIds`), lote por lote,
 * hasta que no quede ninguno -- 100% reanudable ante cualquier corte: si se
 * corta a mitad de camino, la próxima corrida vuelve a pedir "lo que sigue
 * faltando", sin depender de ninguna posición recordada.
 */

// El servicio ArcGIS de MIDAGRI devuelve 404 (HTML genérico de IIS, no un
// error de ArcGIS) cuando la URL de "objectIds" supera ~2000 caracteres --
// confirmado en vivo contra predio_rural (objectid de 7 dígitos): 200 ids
// (2,163 caracteres) falla con 404, 150 ids (1,663 caracteres) funciona
// bien. 150 es seguro incluso para los objectid más largos observados.
const BATCH_SIZE = 150;

interface EsriGeomFeature {
  attributes: { OBJECTID?: number; objectid?: number };
  geometry?: { rings?: number[][][] };
}

interface EsriGeomResponse {
  features?: EsriGeomFeature[];
  error?: { code: number; message: string };
}

async function fetchFaltantes(capa: string, limite: number): Promise<number[]> {
  const { rows } = await pool.query<{ objectid: number }>(
    `SELECT objectid FROM catastro_rural WHERE capa = $1 AND geometry_mp IS NULL AND objectid IS NOT NULL ORDER BY objectid LIMIT $2`,
    [capa, limite]
  );
  return rows.map((r) => r.objectid);
}

const MAX_INTENTOS = 4;

// El servicio de MIDAGRI a veces responde con una página HTML de error
// (WAF/rate-limit) en vez de JSON, de forma intermitente -- confirmado en
// vivo: la MISMA petición que falló una vez funcionó al reintentarla
// segundos después. Reintenta con backoff antes de dar por fallido un lote.
async function fetchGeometrias(layerId: number, objectIds: number[]): Promise<Map<number, object | null>> {
  const params = new URLSearchParams({
    objectIds: objectIds.join(","),
    outFields: "OBJECTID",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const url = `${layerUrl(layerId)}/query?${params.toString()}`;

  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || text.trimStart().startsWith("<")) {
        throw new Error(`MIDAGRI Georural devolvió ${res.status} (no-JSON) al pedir geometrías (capa ${layerId}, intento ${intento})`);
      }
      const body = JSON.parse(text) as EsriGeomResponse;
      if (body.error) throw new Error(`MIDAGRI Georural devolvió error ${body.error.code}: ${body.error.message} (capa ${layerId})`);
      if (!Array.isArray(body.features)) throw new Error(`MIDAGRI Georural no devolvió "features" (capa ${layerId})`);

      const byObjectId = new Map<number, object | null>();
      for (const f of body.features) {
        const oid = f.attributes?.OBJECTID ?? f.attributes?.objectid;
        if (oid === undefined) continue;
        byObjectId.set(oid, ringsToGeoJSON(f.geometry?.rings));
      }
      return byObjectId;
    } catch (error) {
      ultimoError = error;
      if (intento < MAX_INTENTOS) {
        const esperaMs = 2000 * intento;
        console.log(`[capa ${layerId}] fetch de geometrías falló (intento ${intento}/${MAX_INTENTOS}), reintentando en ${esperaMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, esperaMs));
      }
    }
  }
  throw ultimoError;
}

async function aplicarBackfillCapa(layerId: number): Promise<{ capa: string; actualizadas: number }> {
  const capa = getCapaName(layerId);
  let actualizadas = 0;

  while (true) {
    const faltantes = await fetchFaltantes(capa, BATCH_SIZE);
    if (faltantes.length === 0) break;

    const geometrias = await fetchGeometrias(layerId, faltantes);

    // UPDATE en un solo round-trip por lote (no uno por objectid) -- la
    // primera versión hacía hasta 150 queries secuenciales por lote y
    // tardaba ~8 días proyectados para las 3.37M filas; confirmado en vivo
    // (259 filas/min). VALUES + FROM reduce cada lote a una sola query.
    const conGeometria = faltantes
      .map((objectid) => ({ objectid, geomJson: geometrias.get(objectid) }))
      .filter((r): r is { objectid: number; geomJson: object } => r.geomJson !== undefined && r.geomJson !== null);

    if (conGeometria.length > 0) {
      const client = await connectSafe();
      try {
        const values: unknown[] = [];
        const tuples: string[] = [];
        conGeometria.forEach((r, i) => {
          const base = i * 2;
          tuples.push(`($${base + 1}::integer, $${base + 2}::jsonb)`);
          values.push(r.objectid, JSON.stringify(r.geomJson));
        });
        values.push(capa);

        await client.query(
          `UPDATE catastro_rural cr
           SET geometry_mp = ST_Multi(ST_GeomFromGeoJSON(v.geom::text)),
               geometry_valid_mp = ST_Multi(ST_GeomFromGeoJSON(v.geom::text)),
               area_km2 = cr.area_ha / 100,
               updated_at = now()
           FROM (VALUES ${tuples.join(",")}) AS v(objectid, geom)
           WHERE cr.capa = $${values.length} AND cr.objectid = v.objectid`,
          values
        );
        actualizadas += conGeometria.length;
      } finally {
        client.release();
      }
    }

    console.log(`[capa ${layerId} (${capa})] backfill: ${actualizadas} actualizadas hasta ahora (lote de ${faltantes.length} procesado)`);
  }

  console.log(`[capa ${layerId} (${capa})] COMPLETO: ${actualizadas} filas con geometría rellenada`);
  return { capa, actualizadas };
}

export async function backfillGeometria(): Promise<void> {
  const soloLayerId = process.env.LAYER_ID !== undefined ? Number(process.env.LAYER_ID) : null;
  const resultados: { capa: string; actualizadas: number }[] = [];

  for (let layerId = soloLayerId ?? 0; layerId < (soloLayerId !== null ? soloLayerId + 1 : TOTAL_LAYERS); layerId++) {
    const resultado = await aplicarBackfillCapa(layerId);
    resultados.push(resultado);
  }

  console.log(JSON.stringify(resultados, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfillGeometria()
    .then(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
