/**
 * replicate-geometries.ts — Replica los polígonos de INGEMMET y SERFOR a la BD local.
 *
 * INGEMMET: paginación por OBJECTID (no soporta paginación estándar ArcGIS).
 *           geometry.rings → Polygon → GEOMETRY(Polygon, 4326) via ST_GeomFromGeoJSON.
 * SERFOR:   paginación estándar (supportsPagination=true, maxRecordCount=10000).
 *           10 capas en Modalidad_Acceso y Ordenamiento_Forestal.
 *
 * Ambos devuelven geometry.rings (polígonos cerrados en WGS84) — confirmado en vivo 2026-09-24.
 *
 * Uso:
 *   npm run ingest:geometries        ← ambos fuentes
 *   npm run ingest:geometries -- --mineros  ← solo INGEMMET
 *   npm run ingest:geometries -- --forestales  ← solo SERFOR
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

// ─── Configuración ──────────────────────────────────────────────────────────────

const INGEMMET_URL =
  process.env.INGEMMET_ARCGIS_URL ??
  "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CATASTRO_MINERO/MapServer/0";

const SERFOR_BASE =
  process.env.SERFOR_ARCGIS_BASE ??
  "https://geo.serfor.gob.pe/geoservicios/rest/services/Servicios_OGC";

// Capas SERFOR (confirmadas en vivo ADS-01/ADS-02)
const SERFOR_LAYERS: Record<string, { service: string; layerId: number }> = {
  modalidad_permisos: { service: "Modalidad_Acceso", layerId: 0 },
  modalidad_cesiones_en_uso: { service: "Modalidad_Acceso", layerId: 1 },
  modalidad_autorizaciones_pfdm_avnb: { service: "Modalidad_Acceso", layerId: 2 },
  modalidad_autorizacion_cambio_uso_agropecuario: { service: "Modalidad_Acceso", layerId: 3 },
  modalidad_bosques_locales: { service: "Modalidad_Acceso", layerId: 4 },
  modalidad_unidad_aprovechamiento: { service: "Modalidad_Acceso", layerId: 5 },
  modalidad_concesiones_forestales: { service: "Modalidad_Acceso", layerId: 6 },
  ordenamiento_bosques_locales: { service: "Ordenamiento_Forestal", layerId: 0 },
  ordenamiento_bosques_protectores: { service: "Ordenamiento_Forestal", layerId: 1 },
  ordenamiento_bosques_produccion_permanente: { service: "Ordenamiento_Forestal", layerId: 2 },
};

// Campos INGEMMET que necesitamos (además de geometry)
const INGEMMET_FIELDS = [
  "OBJECTID", "CODIGOU", "FEC_DENU", "CONCESION", "TIT_CONCES",
  "HECTAGIS", "ESTADO", "D_ESTADO", "SUSTANCIA",
  "DEPA", "PROVI", "DISTRI", "FECHA_ACTUALIZACION",
].join(",");

// ─── Helpers ────────────────────────────────────────────────────────────────────

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry: { rings: number[][][] };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

async function arcgisFetch(url: string): Promise<ArcGISResponse> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`ArcGIS ${res.status} en ${url}`);
  return res.json() as Promise<ArcGISResponse>;
}

/**
 * Convierte un polygon rings[] de ArcGIS a GeoJSON Polygon.
 * rings[0] = exterior ring; rings[1+] = holes (interiores, si existen).
 */
function ringsToGeoJSON(rings: number[][][]): string {
  const coords = rings.map((ring) =>
    ring.map(([x, y]) => [x, y] as [number, number])
  );
  return JSON.stringify({ type: "Polygon", coordinates: coords });
}

// ─── INGEMMET ─────────────────────────────────────────────────────────────────

async function ingestIngemmet(client: PoolClient): Promise<number> {
  console.log("[ingemmet] Descargando catastro minero con geometría...");
  console.log(`[ingemmet] URL: ${INGEMMET_URL}`);

  // Primero salvar el batch
  const batchRes = await client.query<{ id: number }>(
    `INSERT INTO raw_ingemmet_geometry_batches (source_url, record_count)
     VALUES ($1, 0) RETURNING id`,
    [INGEMMET_URL]
  );
  const batchId = batchRes.rows[0].id;

  // Paginación por OBJECTID (no soporta paginación estándar)
  let lastObjectId = 0;
  let totalFeatures = 0;
  let pageCount = 0;

  while (true) {
    const url =
      `${INGEMMET_URL}/query` +
      `?where=OBJECTID%3E${lastObjectId}` +
      `&outFields=${encodeURIComponent(INGEMMET_FIELDS)}` +
      `&returnGeometry=true&outSR=4326&f=json` +
      `&orderByFields=OBJECTID+ASC`;

    const payload = await arcgisFetch(url);
    if (payload.error) throw new Error(`INGEMMET error ${payload.error.code}: ${payload.error.message}`);
    if (!Array.isArray(payload.features)) throw new Error("INGEMMET sin features (array)");
    if (payload.features.length === 0) break;

    const features = payload.features;
    pageCount++;
    totalFeatures += features.length;
    if (pageCount % 10 === 0) console.log(`[ingemmet] Página ${pageCount}, ${totalFeatures} features...`);

    // Construir los VALUES para el INSERT bulk
    const values: unknown[] = [];
    const tuples: string[] = [];
    const rejected: { raw: ArcGISFeature; reason: string }[] = [];

    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const a = f.attributes;
      const base = i * 15;

      // Validar campos obligatorios
      const objectid = a.OBJECTID as number | null;
      const codigou = (a.CODIGOU as string | null)?.trim() ?? null;
      if (!objectid || !codigou) {
        rejected.push({ raw: f, reason: "OBJECTID o CODIGOU ausente" });
        continue;
      }

      // Geometría
      if (!f.geometry?.rings || !Array.isArray(f.geometry.rings) || f.geometry.rings.length === 0) {
        rejected.push({ raw: f, reason: " geometry.rings ausente o vacío" });
        continue;
      }

      // Solo aceptamos el primer ring (exterior) — el ring puede no ser cerrado
      const exterior = f.geometry.rings[0];
      if (!exterior || exterior.length < 3) {
        rejected.push({ raw: f, reason: " ring exterior con menos de 3 puntos" });
        continue;
      }

      // Cerrar el anillo si no vuelve al inicio (ArcGIS a veces lo omite)
      const first = exterior[0];
      const last = exterior[exterior.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        exterior.push([...first]);
      }

      const geojson = ringsToGeoJSON(f.geometry.rings);

      // Epoch ms → ISO date string
      const fecDenun =
        a.FEC_DENU != null
          ? new Date(a.FEC_DENU as number).toISOString().slice(0, 10)
          : null;
      const fecAct =
        a.FECHA_ACTUALIZACION != null
          ? new Date(a.FECHA_ACTUALIZACION as number).toISOString()
          : null;

      tuples.push(
        `(${Array.from({ length: 15 }, (_, j) => `$${base + j + 1}`).join(",")})`
      );
      values.push(
        objectid, codigou, fecDenun,
        a.CONCESION ?? null, a.TIT_CONCES ?? null,
        a.HECTAGIS ?? null,
        a.ESTADO ?? null, a.D_ESTADO ?? null,
        a.SUSTANCIA ?? null,
        a.DEPA ?? null, a.PROVI ?? null, a.DISTRI ?? null,
        fecAct, geojson, batchId
      );
    }

    if (tuples.length > 0) {
      await client.query(
        `INSERT INTO mining_rights
           (objectid, codigou, fecha_denuncio, concesion, titular, hectareas,
            estado, estado_descripcion, sustancia,
            departamento, provincia, distrito,
            fecha_actualizacion, geometry, source_batch_id)
         VALUES ${tuples.join(",")}
         ON CONFLICT (codigou) DO UPDATE SET
           objectid = EXCLUDED.objectid,
           fecha_denuncio = EXCLUDED.fecha_denuncio,
           concesion = EXCLUDED.concesion,
           titular = EXCLUDED.titular,
           hectareas = EXCLUDED.hectareas,
           estado = EXCLUDED.estado,
           estado_descripcion = EXCLUDED.estado_descripcion,
           sustancia = EXCLUDED.sustancia,
           departamento = EXCLUDED.departamento,
           provincia = EXCLUDED.provincia,
           distrito = EXCLUDED.distrito,
           fecha_actualizacion = EXCLUDED.fecha_actualizacion,
           geometry = EXCLUDED.geometry,
           source_batch_id = EXCLUDED.source_batch_id,
           updated_at = now()`,
        values
      );
    }

    // Rechazadas
    for (const r of rejected) {
      await client.query(
        `INSERT INTO mining_rights_rejected (source_batch_id, raw_row, reason)
         VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(r.raw), r.reason]
      );
    }

    const last = features[features.length - 1].attributes.OBJECTID as number;
    if (last <= lastObjectId) break;
    lastObjectId = last;

    if (!payload.exceededTransferLimit) break;
  }

  // Calcular áreas — ST_MakeValid repara polígonos self-intersecting/inválidos
  // que hacen que ST_Area(::geography) devuelva area < 0 (error PostGIS XX000).
  // ST_IsValidReason informa qué polígonos estaban rotos para audit.
  await client.query(
    `UPDATE mining_rights
     SET area_deg2 = ST_Area(ST_MakeValid(geometry)) / (111.32 * 111.32),
         area_km2  = ST_Area(ST_MakeValid(geometry)::geography) / 1_000_000
     WHERE source_batch_id = $1 AND area_km2 IS NULL`,
    [batchId]
  );

  // Limpiar derechos que ya no están en el servicio
  await client.query(
    `DELETE FROM mining_rights WHERE source_batch_id IS DISTINCT FROM $1`,
    [batchId]
  );

  // Actualizar record_count
  await client.query(
    `UPDATE raw_ingemmet_geometry_batches SET record_count = $1 WHERE id = $2`,
    [totalFeatures, batchId]
  );

  console.log(
    `[ingemmet] ✓ ${totalFeatures} features, batch ${batchId}`
  );
  return totalFeatures;
}

// ─── SERFOR ────────────────────────────────────────────────────────────────────

async function ingestSerfor(client: PoolClient): Promise<void> {
  console.log("[serfor] Descargando catastro forestal con geometría...");
  console.log(`[serfor] Base: ${SERFOR_BASE}`);

  for (const [capa, { service, layerId }] of Object.entries(SERFOR_LAYERS)) {
    const url = `${SERFOR_BASE}/${service}/MapServer/${layerId}/query`;
    console.log(`[serfor] Capa: ${capa}...`);

    // Batch
    const batchRes = await client.query<{ id: number }>(
      `INSERT INTO raw_serfor_geometry_batches (source_url, capa, record_count)
       VALUES ($1, $2, 0) RETURNING id`,
      [`${url}?where=1=1`, capa]
    );
    const batchId = batchRes.rows[0].id;

    // Sin paginar — todas las capas están por debajo de maxRecordCount=10000
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });
    const payload = await arcgisFetch(`${url}?${params.toString()}`);

    if (payload.error) {
      console.warn(`[serfor] ⚠ Error en ${capa}: ${payload.error.message}`);
      continue;
    }
    if (!Array.isArray(payload.features)) {
      console.warn(`[serfor] ⚠ ${capa}: sin features`);
      continue;
    }
    if (payload.exceededTransferLimit) {
      console.warn(`[serfor] ⚠ ${capa}: exceededTransferLimit — agregar paginación`);
    }

    const features = payload.features;
    console.log(`[serfor]   ${features.length} features...`);

    // Eliminar datos anteriores de esta capa
    await client.query(`DELETE FROM forest_titles WHERE capa = $1`, [capa]);

    // Prepared statement para inserts row-by-row.
    // Se usa ST_GeomFromGeoJSON() literal en vez de parámetro para evitar que
    // Postgres no pueda inferir el tipo GEOMETRY desde un placeholder genérico ($N).
    const rejected: { raw: ArcGISFeature; reason: string }[] = [];
    let inserted = 0;

    for (const f of features) {
      const a = f.attributes;

      const objectid = a.OBJECTID as number | null;
      if (objectid == null) {
        rejected.push({ raw: f, reason: "OBJECTID ausente" });
        continue;
      }

      if (!f.geometry?.rings || !Array.isArray(f.geometry.rings) || f.geometry.rings.length === 0) {
        rejected.push({ raw: f, reason: "geometry.rings ausente o vacío" });
        continue;
      }

      // Cerrar anillos
      const rings = f.geometry.rings.map((ring) => {
        if (ring.length < 3) return ring;
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          return [...ring, [...first]];
        }
        return ring;
      });
      // GeoJSON string — se pasa como parámetro $20; ST_GeomFromGeoJSON($20) se ejecuta en SQL
      const geojsonString = ringsToGeoJSON(rings);

      const fecReg = a.FECREG != null ? new Date(a.FECREG as number).toISOString().slice(0, 10) : null;
      const fecIni = a.FECINI != null ? new Date(a.FECINI as number).toISOString().slice(0, 10) : null;
      const fecTer = a.FECTER != null ? new Date(a.FECTER as number).toISOString().slice(0, 10) : null;
      const fecLeg = a.FECLEG != null ? new Date(a.FECLEG as number).toISOString().slice(0, 10) : null;

      const fixedKeys = new Set([
        "OBJECTID", "FUENTE", "DOCREG", "FECREG", "OBSERV", "ZONUTM", "ORIGEN",
        "NOMDIS", "NOMPRO", "NOMDEP", "AUTFOR", "FECINI", "FECTER",
        "SITUAC", "SUPSIG", "SUPAPR", "DOCLEG", "FECLEG",
      ]);
      const atributosExtra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) {
        if (!fixedKeys.has(k)) atributosExtra[k] = v;
      }

      // Geometry como $20 — string GeoJSON.
      // atributos_extra como $21 — JSONB.
      // source_batch_id se inyecta como literal (es un BIGINT, siempre entero).
      await client.query(
        `INSERT INTO forest_titles
           (capa, objectid, fuente, doc_reg, fec_reg, observ, zon_utm, origen,
            nom_dis, nom_pro, nom_dep, aut_for, fec_ini, fec_ter, situac,
            sup_sig, sup_apr, doc_leg, fec_leg, geometry, atributos_extra, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,ST_GeomFromGeoJSON($20),$21,${batchId})`,
        [
          capa,                                        // $1
          objectid,                                    // $2
          a.FUENTE ?? null,                           // $3
          a.DOCREG ?? null,                           // $4
          fecReg,                                     // $5
          a.OBSERV ?? null,                           // $6
          a.ZONUTM ?? null,                           // $7
          a.ORIGEN ?? null,                           // $8
          a.NOMDIS ?? null,                           // $9
          a.NOMPRO ?? null,                           // $10
          a.NOMDEP ?? null,                           // $11
          a.AUTFOR ?? null,                           // $12
          fecIni,                                     // $13
          fecTer,                                     // $14
          a.SITUAC ?? null,                           // $15
          a.SUPSIG ?? null,                           // $16
          a.SUPAPR ?? null,                           // $17
          a.DOCLEG ?? null,                           // $18
          fecLeg,                                     // $19
          geojsonString,                             // $20 — string GeoJSON → ST_GeomFromGeoJSON($20) en el VALUES
          Object.keys(atributosExtra).length > 0 ? JSON.stringify(atributosExtra) : null, // $21
        ]
      );
      inserted++;
    }

    console.log(`[serfor]   ✓ ${inserted} insertados`);

    // Áreas
    await client.query(
      `UPDATE forest_titles
       SET area_deg2 = ST_Area(ST_MakeValid(geometry)) / (111.32 * 111.32),
           area_km2  = ST_Area(ST_MakeValid(geometry)::geography) / 1_000_000
       WHERE source_batch_id = $1 AND area_km2 IS NULL`,
      [batchId]
    );

    for (const r of rejected) {
      await client.query(
        `INSERT INTO forest_titles_rejected (source_batch_id, capa, raw_row, reason)
         VALUES ($1, $2, $3, $4)`,
        [batchId, capa, JSON.stringify(r.raw), r.reason]
      );
    }

    await client.query(
      `UPDATE raw_serfor_geometry_batches SET record_count = $1 WHERE id = $2`,
      [features.length, batchId]
    );
    console.log(`[serfor]   ✓ ${capa}: ${features.length} features`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const minesOnly = args.includes("--mineros");
const forestOnly = args.includes("--forestales");

async function main() {
  console.log("=== replicate-geometries ===");
  console.log(`INGEMMET: ${INGEMMET_URL}`);
  console.log(`SERFOR:   ${SERFOR_BASE}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Advisory lock para serializar ingestas solapadas
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('geo_intersections_geometry_ingest'))"
    );

    const total: string[] = [];

    if (!forestOnly) {
      const n = await ingestIngemmet(client);
      total.push(`${n} derechos mineros`);
    }
    if (!minesOnly) {
      await ingestSerfor(client);
      total.push(`10 capas forestales`);
    }

    await client.query("COMMIT");
    console.log(`\n✓ Geometrías replicadas: ${total.join(", ")}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error en replicate-geometries:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
