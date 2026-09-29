import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * @fidelity: precomputado
 *
 * `summary()` (GET /api/territories/summary) es un port literal de
 * `apps/ceplan-geo/api/src/lib/territory-summary.ts::getDepartmentTerritorySummary`,
 * que no vive en `routes/` ni en `crossref/` de esa app sino en `lib/` — el
 * mismo SELECT, sin cambios. El resto del módulo (`list()`, `getTerritoryByUbigeo`,
 * `lookupTerritoryByNames`) sigue siendo trazable via `crossref/territory-lookup.ts`
 * de la misma app, ya incluido por este marcador.
 */

/* ---------------------------------------------------------------------------
 * Copiado de `apps/ceplan-geo/api/src/ingest/normalize.ts` — mcp-server no
 * declara el workspace de apps como dependencia (mismo motivo documentado en
 * `../proveedores-sancionados/_helpers.ts`), así que estas utilidades puras
 * viven acá tal cual.
 * ------------------------------------------------------------------------- */
const ACCENT_MAP: Record<string, string> = {
  Á: "A",
  É: "E",
  Í: "I",
  Ó: "O",
  Ú: "U",
  Ñ: "N",
  Ü: "U",
};

function normalizeTerritoryToken(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑÜ]/g, (ch) => ACCENT_MAP[ch] ?? ch)
    .replace(/\s+/g, " ");
  return upper;
}

/* ---------------------------------------------------------------------------
 * Copiado de `apps/ceplan-geo/api/src/crossref/territory-lookup.ts`.
 * ------------------------------------------------------------------------- */
type TerritoryMatchStatus = "confirmada" | "candidata" | "sin_match";

const PROVINCIA_ALIASES: Record<string, string> = {
  "PROV CONST DEL CALLAO": "CALLAO",
  NAZCA: "NASCA",
};

function canonicalizarProvinciaFuente(provincia: string | null): string | null {
  if (provincia == null) return null;
  return PROVINCIA_ALIASES[provincia] ?? provincia;
}

type TerritoryRecord = {
  ubigeo: string;
  departamento: string;
  provincia: string | null;
  distrito: string | null;
  geometryGeojson: string | null;
};

type TerritoryQueryRow = NeonRow & {
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

async function queryTerritoriesExact(
  db: ToolHandlerContext["db"],
  dept: string,
  prov: string | null,
  dist: string | null
): Promise<TerritoryQueryRow[]> {
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

  const { rows } = await db.query<TerritoryQueryRow>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ${conditions.join(" AND ")}`,
    params
  );
  return rows;
}

function candidatosConNRestaurada(token: string | null): string[] {
  if (!token) return [];
  const candidatos: string[] = [];
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === " ") {
      candidatos.push(`${token.slice(0, i)}N${token.slice(i + 1)}`);
    }
  }
  return candidatos;
}

async function intentarRecuperacionEnye(
  db: ToolHandlerContext["db"],
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
      const rows = await queryTerritoriesExact(db, dept, provCandidato, distCandidato);
      if (rows.length > 0) resultadosConFilas.push(rows);
    }
    if (resultadosConFilas.length === 1 && resultadosConFilas[0].length === 1) {
      return resultadosConFilas[0];
    }
    if (resultadosConFilas.length > 0) return null; // ambiguo en este nivel: no adivinar
  }
  return null;
}

async function getTerritoryByUbigeo(db: ToolHandlerContext["db"], ubigeo: string): Promise<TerritoryRecord | null> {
  const { rows } = await db.query<TerritoryQueryRow>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ubigeo = $1`,
    [ubigeo]
  );
  if (rows.length === 0) return null;
  return mapTerritoryRow(rows[0]);
}

async function lookupTerritoryByNames(
  db: ToolHandlerContext["db"],
  departamento: string | null | undefined,
  provincia: string | null | undefined,
  distrito: string | null | undefined
): Promise<{ territory: TerritoryRecord | null; matchStatus: TerritoryMatchStatus }> {
  const dept = normalizeTerritoryToken(departamento);
  const prov = canonicalizarProvinciaFuente(normalizeTerritoryToken(provincia));
  const dist = normalizeTerritoryToken(distrito);

  if (!dept) return { territory: null, matchStatus: "sin_match" };

  const rows = await queryTerritoriesExact(db, dept, prov, dist);

  if (rows.length === 0) {
    const recuperadas =
      prov?.includes(" ") || dist?.includes(" ") ? await intentarRecuperacionEnye(db, dept, prov, dist) : null;
    if (recuperadas) return { territory: mapTerritoryRow(recuperadas[0]), matchStatus: "confirmada" };
    return { territory: null, matchStatus: "sin_match" };
  }
  if (rows.length > 1) {
    return { territory: mapTerritoryRow(rows[0]), matchStatus: "candidata" };
  }

  return { territory: mapTerritoryRow(rows[0]), matchStatus: "confirmada" };
}

function territoryFromRow(row: Record<string, unknown>) {
  return {
    ubigeo: String(row.ubigeo),
    departamento: String(row.departamento),
    provincia: row.provincia ? String(row.provincia) : null,
    distrito: row.distrito ? String(row.distrito) : null,
    geometry: row.geometry_geojson ? JSON.parse(String(row.geometry_geojson)) : null,
  };
}

/* ---------------------------------------------------------------------------
 * Copiado de `apps/ceplan-geo/api/src/lib/pilot-departments.ts`.
 * ------------------------------------------------------------------------- */
const PILOT_DEPARTMENTS = [
  { name: "LA LIBERTAD", ubigeoPrefix: "13" },
  { name: "LAMBAYEQUE", ubigeoPrefix: "14" },
  { name: "PIURA", ubigeoPrefix: "20" },
  { name: "CAJAMARCA", ubigeoPrefix: "06" },
  { name: "CUSCO", ubigeoPrefix: "08" },
] as const;

function isPilotDepartment(value: string): boolean {
  return PILOT_DEPARTMENTS.some((row) => row.name === value.toUpperCase().trim());
}

function getPilotDepartment(value: string) {
  const normalized = value.toUpperCase().trim();
  return PILOT_DEPARTMENTS.find((row) => row.name === normalized) ?? null;
}

/**
 * Handler para `ceplan_geo_territories` — GET /api/territories.
 * Idéntico a `apps/ceplan-geo/api/src/routes/territories.ts`, delegando en
 * `getTerritoryByUbigeo` / `lookupTerritoryByNames` de
 * `apps/ceplan-geo/api/src/crossref/territory-lookup.ts` (copiadas arriba).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;

  if (ubigeo) {
    const territory = await getTerritoryByUbigeo(db, ubigeo);
    if (!territory) {
      return { status: 404, body: { error: "Territorio no encontrado." } };
    }
    return { status: 200, body: territoryFromRow({ ...territory, geometry_geojson: territory.geometryGeojson }) };
  }

  if (!departamento) {
    return { status: 400, body: { error: "Indique ubigeo o departamento." } };
  }

  const { territory, matchStatus } = await lookupTerritoryByNames(db, departamento, provincia, distrito);

  if (!territory) {
    return { status: 404, body: { error: "Territorio no encontrado.", matchStatus } };
  }

  return {
    status: 200,
    body: { ...territoryFromRow({ ...territory, geometry_geojson: territory.geometryGeojson }), matchStatus },
  };
}

/**
 * Handler para `ceplan_geo_territories_summary` — GET /api/territories/summary.
 * PostGIS: `ST_Within` para contar infraestructura dentro del polígono
 * departamental. Requiere `postgis` habilitada en la base `ceplan_geo`.
 */
export async function summary(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string;
  const normalized = departamento.toUpperCase().trim();

  if (!isPilotDepartment(normalized)) {
    return {
      status: 400,
      body: {
        error: "Departamento fuera del piloto ALSOL Fase 2.",
        departamentosPermitidos: ["LA LIBERTAD", "LAMBAYEQUE", "PIURA", "CAJAMARCA", "CUSCO"],
      },
    };
  }

  const pilot = getPilotDepartment(normalized);
  if (!pilot) {
    return { status: 404, body: { error: "Resumen territorial no encontrado." } };
  }

  // @nuevo: port literal de apps/ceplan-geo/api/src/lib/territory-summary.ts (no vive en routes/ ni crossref/)
  const { rows: districtRows } = await db.query<NeonRow & { distritos: string }>(
    `SELECT COUNT(*)::text AS distritos FROM territories WHERE departamento = $1`,
    [normalized]
  );

  // @nuevo: port literal de apps/ceplan-geo/api/src/lib/territory-summary.ts (no vive en routes/ ni crossref/)
  const { rows: infraRows } = await db.query<NeonRow & { infra_type: string; total: string }>(
    `SELECT i.infra_type, COUNT(*)::text AS total
     FROM infrastructure i
     JOIN territories t ON ST_Within(i.geometry, t.geometry)
     WHERE t.departamento = $1
     GROUP BY i.infra_type
     ORDER BY i.infra_type`,
    [normalized]
  );

  return {
    status: 200,
    body: {
      departamento: normalized,
      ubigeoPrefijo: pilot.ubigeoPrefix,
      distritos: Number(districtRows[0]?.distritos ?? 0),
      infraestructura: Object.fromEntries(infraRows.map((row) => [row.infra_type, Number(row.total)])),
      fuente: "ceplan-geo",
    },
  };
}

/**
 * Handler para `ceplan_geo_territories_bbox` — GET /api/territories/bbox.
 * PostGIS: `ST_Intersects` + `ST_MakeEnvelope`.
 */
export async function bbox(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const minx = Number(args.minx);
  const miny = Number(args.miny);
  const maxx = Number(args.maxx);
  const maxy = Number(args.maxy);

  const { rows } = await db.query<TerritoryQueryRow>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsGeoJSON(geometry) AS geometry_geojson
     FROM territories
     WHERE ST_Intersects(
       geometry,
       ST_MakeEnvelope($1, $2, $3, $4, 4326)
     )
     ORDER BY ubigeo
     LIMIT 500`,
    [minx, miny, maxx, maxy]
  );

  return {
    status: 200,
    body: { resultados: rows.map((row) => territoryFromRow(row as Record<string, unknown>)) },
  };
}

/** Exportadas para reutilizarlas desde `crossref.ts` y `denominadores.ts` (mismo módulo `ceplan-geo`). */
export { getTerritoryByUbigeo, lookupTerritoryByNames };
