import { pool } from "../db/pool.js";
import { normalizeTerritoryToken } from "../ingest/normalize.js";

export type TerritoryMatchStatus = "confirmada" | "candidata" | "sin_match";

/**
 * Alias de provincia de una fuente externa (hoy solo INFOBRAS) hacia el
 * nombre canónico ya usado en `territories` (derivado de GeoServer CEPLAN).
 * Mismo tipo de problema que `canonicalizarDepartamentoFuente()` en
 * infobras (CT-06, 2026-09-08) — ahí era el departamento de Callao
 * ("P C DEL CALLAO"); acá es la provincia ("PROV CONST DEL CALLAO" vs.
 * "CALLAO") — pero a diferencia de esa, esta se aplica solo al hacer el
 * cruce, nunca sobre `territories` ni sobre lo que guarda
 * `territory_name_crosswalk.provincia` (que conserva el literal de la
 * fuente, igual que el resto del catálogo). Vive aquí, no en
 * `ingest/normalize.ts`, porque `lookupTerritoryByNames` es su único
 * caller — es un alias de cruce, no de ingesta de GeoServer (revisión de
 * código, 2026-09-13). Encontrado el 2026-09-13: las 7 obras de Callao en
 * INFOBRAS quedaban "sin_match" (0% de confirmación) por este alias sin
 * cubrir.
 */
const PROVINCIA_ALIASES: Record<string, string> = {
  "PROV CONST DEL CALLAO": "CALLAO",
};

export function canonicalizarProvinciaFuente(provincia: string | null): string | null {
  if (provincia == null) return null;
  return PROVINCIA_ALIASES[provincia] ?? provincia;
}

export type TerritoryRecord = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometryGeojson: string | null;
};

type TerritoryQueryRow = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometry_geojson: string | null;
};

function mapTerritoryRow(row: TerritoryQueryRow): TerritoryRecord {
  return {
    ubigeo: row.ubigeo,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    geometryGeojson: row.geometry_geojson,
  };
}

async function queryTerritoriesExact(dept: string, prov: string | null, dist: string | null): Promise<TerritoryQueryRow[]> {
  const params: string[] = [dept];
  const conditions = ["UPPER(departamento) = $1"];

  if (prov) {
    params.push(prov);
    conditions.push(`UPPER(COALESCE(provincia, '')) = $${params.length}`);
  }
  if (dist) {
    params.push(dist);
    conditions.push(`UPPER(COALESCE(distrito, '')) = $${params.length}`);
  }

  const { rows } = await pool.query<TerritoryQueryRow>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ${conditions.join(" AND ")}`,
    params
  );
  return rows;
}

/**
 * Recuperación del defecto de la fuente INFOBRAS/Contraloría: el propio
 * XLSX que publican trae la "Ñ" reemplazada por un espacio en decenas de
 * provincias/distritos a nivel nacional (confirmado inspeccionando el XML
 * crudo del XLSX descargado — no es un bug de nuestro parser, el archivo
 * fuente ya trae "CA ETE" en vez de "CAÑETE"). El candidato usa "N", no
 * "Ñ": `territories` (vía `normalizeTerritoryToken`/`ACCENT_MAP` en
 * `ingest/normalize.ts`) ya guarda toda "Ñ" como "N" sin tilde — "CAÑETE"
 * vive ahí como "CANETE" — así que restaurar la tilde real nunca
 * calzaría contra el catálogo; hay que igualar la misma convención de
 * normalización que ya usa el resto del sistema (confirmado en vivo:
 * `SELECT ... FROM territories WHERE distrito ILIKE '%CANETE%'` sí
 * devuelve el distrito real, `'%CAÑETE%'` no devuelve nada). Genera, para
 * un token dado, una variante por cada espacio interno reemplazado por
 * "N" — nunca se aplica sobre `territories` mismo, solo sobre el literal
 * que llega de una fuente externa antes de intentar el cruce.
 *
 * Límite conocido (revisión de código, 2026-09-13): si la fuente reemplaza
 * una "Ñ" en la *primera posición* de un token (ej. el distrito real
 * "ÑUÑOA", Puno), el espacio resultante queda al inicio del string, y
 * `normalizeTerritoryToken` ya lo eliminó con `.trim()` antes de que esta
 * función reciba el valor — no hay espacio que sustituir, así que ese caso
 * no es recuperable con este algoritmo. No se encontró ningún caso real de
 * esto en las 25 regiones ya construidas (verificado: 0 filas de
 * `territory_name_crosswalk` con `distrito`/`provincia` empezando en
 * espacio), así que no se resuelve aquí — si aparece en una carga futura,
 * necesitaría capturarse antes del trim, no dentro de esta función.
 */
export function candidatosConNRestaurada(token: string | null): string[] {
  if (!token) return [];
  const candidatos: string[] = [];
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === " ") {
      candidatos.push(`${token.slice(0, i)}N${token.slice(i + 1)}`);
    }
  }
  return candidatos;
}

/**
 * Intenta recuperar un match cuando la búsqueda exacta falló, probando
 * candidatos con la "N" restaurada en distrito, luego en provincia, luego en
 * ambos combinados — en ese orden, deteniéndose en el primer nivel que
 * produzca resultados. Solo se acepta la recuperación si, dentro de ese
 * nivel, exactamente un candidato produce exactamente una fila: cualquier
 * ambigüedad (0 o >1 candidatos con resultados, o un candidato con >1 fila)
 * se descarta sin adivinar — coherente con el resto del matcher, que nunca
 * resuelve un empate por conveniencia.
 *
 * Costo (revisión de código, 2026-09-13): esta función corre una consulta
 * secuencial por candidato (hasta ~(espacios en distrito) + (espacios en
 * provincia) + (espacios en distrito × espacios en provincia) queries) antes
 * de rendirse. En el build batch (`crossref/build-crosswalk.ts`) esto es
 * intrascendente — corre una vez por triada, offline. En el camino en vivo
 * (`routes/crossref.ts`, `GET /crossref/obras`) se dispara por cada obra sin
 * entrada cacheada como `confirmada`/`candidata`, dentro de un `for`
 * secuencial — un nombre corrupto de varias palabras puede sumar decenas de
 * round-trips a la base para una sola obra. No se optimizó en este cambio:
 * el crosswalk ya reduce cuánto se llega a este camino (el build nacional
 * ya corrió y absorbió el costo una vez), y `GET /crossref/obras` ya
 * documentaba de antes que recalcula en vivo sin caché — pero si el volumen
 * de obras sin caché crece, vale la pena revisar antes de que degrade el
 * endpoint.
 */
async function intentarRecuperacionEnye(
  dept: string,
  prov: string | null,
  dist: string | null
): Promise<TerritoryQueryRow[] | null> {
  const nivelesDeIntentos: Array<[string | null, string | null][]> = [
    candidatosConNRestaurada(dist).map((d) => [prov, d]),
    candidatosConNRestaurada(prov).map((p) => [p, dist]),
    candidatosConNRestaurada(prov).flatMap((p) => candidatosConNRestaurada(dist).map((d): [string, string] => [p, d])),
  ];

  for (const intentos of nivelesDeIntentos) {
    const resultadosConFilas: TerritoryQueryRow[][] = [];
    for (const [provCandidato, distCandidato] of intentos) {
      const rows = await queryTerritoriesExact(dept, provCandidato, distCandidato);
      if (rows.length > 0) resultadosConFilas.push(rows);
    }
    if (resultadosConFilas.length === 1 && resultadosConFilas[0].length === 1) {
      return resultadosConFilas[0];
    }
    if (resultadosConFilas.length > 0) return null; // ambiguo en este nivel: no adivinar
  }
  return null;
}

export async function getTerritoryByUbigeo(ubigeo: string): Promise<TerritoryRecord | null> {
  const { rows } = await pool.query<{
    ubigeo: string;
    departamento: string;
    provincia: string | null;
    distrito: string | null;
    geometry_geojson: string | null;
  }>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ubigeo = $1`,
    [ubigeo]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    ubigeo: row.ubigeo,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    geometryGeojson: row.geometry_geojson,
  };
}

export async function lookupTerritoryByNames(
  departamento: string | null | undefined,
  provincia: string | null | undefined,
  distrito: string | null | undefined
): Promise<{ territory: TerritoryRecord | null; matchStatus: TerritoryMatchStatus }> {
  const dept = normalizeTerritoryToken(departamento);
  const prov = canonicalizarProvinciaFuente(normalizeTerritoryToken(provincia));
  const dist = normalizeTerritoryToken(distrito);

  if (!dept) return { territory: null, matchStatus: "sin_match" };

  const rows = await queryTerritoriesExact(dept, prov, dist);

  if (rows.length === 0) {
    // El nombre no calzó tal cual — antes de rendirse, probar si el
    // defecto de la Ñ de la fuente explica la falla (ver
    // `intentarRecuperacionEnye`). Solo se acepta si resuelve sin ambigüedad.
    const recuperadas = (prov?.includes(" ") || dist?.includes(" "))
      ? await intentarRecuperacionEnye(dept, prov, dist)
      : null;
    if (recuperadas) return { territory: mapTerritoryRow(recuperadas[0]), matchStatus: "confirmada" };
    return { territory: null, matchStatus: "sin_match" };
  }
  if (rows.length > 1) {
    return { territory: mapTerritoryRow(rows[0]), matchStatus: "candidata" };
  }

  return { territory: mapTerritoryRow(rows[0]), matchStatus: "confirmada" };
}
