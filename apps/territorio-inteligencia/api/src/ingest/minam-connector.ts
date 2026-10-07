import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

/**
 * GeoServidor MINAM, capa `Tem_AlertasTempranasDeforestacion` — confirmado en
 * vivo 2026-10-07: servicio ArcGIS REST real (no el mock con `Math.random()`
 * que tenía este archivo antes). Son puntos (lat/lon), no polígonos: no
 * reporta superficie deforestada propia, por eso `minam_alertas_deforestacion`
 * no tiene esa columna — el riesgo se calcula contando alertas dentro de un
 * polígono de título forestal (ver riesgo-eudr.service.ts), no sumando
 * hectáreas que esta fuente no da.
 */
const BASE_URL =
  "https://geoservidorperu.minam.gob.pe/arcgis/rest/services/Servicios_OGC/Peru_MINAM_0104/MapServer/0/query";
const PAGE_SIZE = 1000;
const DATASET = "minam_alertas_tempranas_deforestacion";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface MinamFeature {
  attributes: {
    tipo: string | null;
    SIST_REF: number | null;
    OBJECTID: number;
    Fecha: string | null;
    D_LEGAL: string | null;
  };
  geometry: { x: number; y: number };
}

interface MinamQueryResponse {
  features: MinamFeature[];
  exceededTransferLimit?: boolean;
}

/** "2/01/2020" (d/m/yyyy, sin cero a la izquierda) → "2020-01-02". Vacío/null → null. */
function toIsoDate(value: string | null): string | null {
  if (!value) return null;
  const [dd, mm, yyyy] = value.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function fetchPage(offset: number): Promise<{ raw: string; parsed: MinamQueryResponse }> {
  const url =
    `${BASE_URL}?where=1%3D1&outFields=*&returnGeometry=true&f=json` +
    `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MINAM devolvió ${res.status} al pedir offset=${offset}`);
  const raw = await res.text();
  return { raw, parsed: JSON.parse(raw) as MinamQueryResponse };
}

async function ingestMinam(): Promise<{ batchId: number; filasInsertadas: number; paginas: number }> {
  const client = await pool.connect();
  try {
    let offset = 0;
    let paginas = 0;
    let filasInsertadas = 0;
    const checksumParts: string[] = [];

    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_minam_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, BASE_URL, "pending", 0]
    );
    const batchId = batchRows[0].id;

    for (;;) {
      const { raw, parsed } = await fetchPage(offset);
      checksumParts.push(raw);
      paginas++;

      if (parsed.features.length === 0) break;

      const validas = parsed.features.filter(
        (f) => f.geometry && typeof f.geometry.x === "number" && typeof f.geometry.y === "number"
      );

      if (validas.length > 0) {
        // Un solo INSERT multi-fila por página en vez de 1000 awaits
        // secuenciales — la versión anterior tardaba minutos por página por
        // el round-trip de red a Neon en cada fila.
        const values: unknown[] = [];
        const placeholders = validas.map((f, i) => {
          const { attributes: a, geometry: g } = f;
          const base = i * 8;
          values.push(a.OBJECTID, a.tipo, a.SIST_REF, toIsoDate(a.Fecha), a.D_LEGAL, g.x, g.y, batchId);
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
        });

        await client.query("BEGIN");
        try {
          await client.query(
            `INSERT INTO minam_alertas_deforestacion
               (object_id, tipo, sist_ref, fecha_alerta, d_legal, longitud, latitud, source_batch_id)
             VALUES ${placeholders.join(",")}
             ON CONFLICT (object_id) DO NOTHING`,
            values
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
        filasInsertadas += validas.length;
      }

      if (parsed.features.length < PAGE_SIZE && !parsed.exceededTransferLimit) break;
      offset += PAGE_SIZE;
    }

    await client.query(
      `UPDATE raw_minam_batches SET checksum = $1, record_count = $2 WHERE id = $3`,
      [checksumOf(checksumParts.join("\n")), filasInsertadas, batchId]
    );

    return { batchId, filasInsertadas, paginas };
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestMinam()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
