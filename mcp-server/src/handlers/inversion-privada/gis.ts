import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

/**
 * Copia de `apps/inversion-privada/api/src/ingest/normalize.ts` — `mcp-server`
 * no depende del workspace de `apps/` (ver docblock de
 * `../proveedores-sancionados/_helpers.ts`).
 */
const INEI_DEPARTMENTS: { code: string; name: string }[] = [
  { code: "01", name: "AMAZONAS" },
  { code: "02", name: "ANCASH" },
  { code: "03", name: "APURIMAC" },
  { code: "04", name: "AREQUIPA" },
  { code: "05", name: "AYACUCHO" },
  { code: "06", name: "CAJAMARCA" },
  { code: "07", name: "CALLAO" },
  { code: "08", name: "CUSCO" },
  { code: "09", name: "HUANCAVELICA" },
  { code: "10", name: "HUANUCO" },
  { code: "11", name: "ICA" },
  { code: "12", name: "JUNIN" },
  { code: "13", name: "LA LIBERTAD" },
  { code: "14", name: "LAMBAYEQUE" },
  { code: "15", name: "LIMA" },
  { code: "16", name: "LORETO" },
  { code: "17", name: "MADRE DE DIOS" },
  { code: "18", name: "MOQUEGUA" },
  { code: "19", name: "PASCO" },
  { code: "20", name: "PIURA" },
  { code: "21", name: "PUNO" },
  { code: "22", name: "SAN MARTIN" },
  { code: "23", name: "TACNA" },
  { code: "24", name: "TUMBES" },
  { code: "25", name: "UCAYALI" },
];

interface GeometryRow extends NeonRow {
  codigo: string;
  id_proyecto: number;
  nombre_proyecto: string;
  sector: string;
  fase: string;
  tipo_proyecto: string;
  departamentos_inei: string[] | null;
  tipo_coordenada: string;
  geometry: unknown;
}

function resolveIneiCode(departamento: string): string | null {
  const needle = departamento.trim().toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
  const match = INEI_DEPARTMENTS.find(
    (d) => d.name.normalize("NFD").replace(/\p{M}/gu, "") === needle,
  );
  return match?.code ?? null;
}

function toFeature(r: GeometryRow) {
  return {
    type: "Feature",
    geometry: r.geometry,
    properties: {
      codigo: r.codigo,
      idProyecto: r.id_proyecto,
      nombreProyecto: r.nombre_proyecto,
      sector: r.sector,
      fase: r.fase,
      tipoProyecto: r.tipo_proyecto,
      departamentosInei: r.departamentos_inei,
      tipoCoordenada: r.tipo_coordenada,
    },
  };
}

/**
 * Handler para `inversion_privada_gis_geojson` — GET /api/gis/geojson.
 *
 * SQL idéntico a `apps/inversion-privada/api/src/routes/gis.ts`.
 */
export async function geojson(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    const ineiCode = resolveIneiCode(departamento);
    if (!ineiCode) {
      return { status: 400, body: { error: `Departamento desconocido: ${departamento}` } };
    }
    values.push(ineiCode);
    conditions.push(`$${values.length} = ANY(g.departamentos_inei)`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<GeometryRow>(
    `SELECT g.codigo, g.id_proyecto, g.nombre_proyecto, g.sector, g.fase, g.tipo_proyecto,
            g.departamentos_inei, g.tipo_coordenada, g.geometry
     FROM vertix_project_geometries g
     ${where}
     ORDER BY g.codigo`,
    values,
  );

  return {
    status: 200,
    body: {
      type: "FeatureCollection",
      features: rows.map(toFeature),
      fuente: { dataset: "PROINVERSIÓN / VERTIX GIS (ListaRegistrosCapas)" },
    },
  };
}

/**
 * Handler para `inversion_privada_gis_project_geometry` — GET /api/gis/projects/{vertixId}.
 */
export async function projectGeometry(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const vertixId = Number(args.vertixId);
  if (!Number.isInteger(vertixId) || vertixId <= 0) {
    return { status: 400, body: { error: "vertixId inválido." } };
  }

  const { rows } = await db.query<GeometryRow>(
    `SELECT g.codigo, g.id_proyecto, g.nombre_proyecto, g.sector, g.fase, g.tipo_proyecto,
            g.departamentos_inei, g.tipo_coordenada, g.geometry
     FROM vertix_project_geometries g
     WHERE g.id_proyecto = $1
     ORDER BY g.codigo`,
    [vertixId],
  );

  return {
    status: 200,
    body: {
      type: "FeatureCollection",
      features: rows.map(toFeature),
    },
  };
}
