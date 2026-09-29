import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { crossAppPool } from "../proveedores-sancionados/_helpers.js";

/**
 * Igual que `NUMERIC_COLUMNS` de
 * `apps/poder-judicial/api/src/ingest/procesos-judiciales-normalize.ts` —
 * copiado tal cual porque `mcp-server` no depende de ese paquete de la app.
 */
const NUMERIC_COLUMNS = [
  "PENDIENTET",
  "PPLAZOIMPUG",
  "PENDIENTEE",
  "PENDIENTE",
  "IMPROCEDENTEI",
  "NADMITIDO",
  "APE_INSINFERIOR",
  "APE_INSSUPERIORANULADA",
  "INGRESOT_SIN",
  "DEOTRADEPENT",
  "INGRESOT_CON",
  "RESCONSENTIDA",
  "APE_CONFIRMADAI",
  "APE_REVOCADAI",
  "INGRESOE_SIN",
  "DEOTRADEPENE",
  "INGRESOE_CON",
  "INGRESO_SIN",
  "INGRESO_CON",
  "IMPROCEDENTER",
  "SENTENCIA",
  "AUTODEFINITIVO",
  "CONCILIADO",
  "INFORMEFINAL",
  "APE_CONFIRMADAR",
  "APE_REVOCADAR",
  "APE_ANULADAR",
  "APE_RESUELTA",
  "RESUELTOT",
  "OTROSEGRESOST",
  "RESUELTOE",
  "OTROSEGRESOSE",
  "RESUELTO",
  "CONFIRMADA_ADEF",
  "REVOCADA_ADEF",
  "RDEV_CONFIRMADA",
  "RDEV_ANULADA",
  "RDEV_REVOCADA",
  "PENDIENTECALF",
  "INGRESOCALF",
  "RESUELTOCALF",
  "PENDIENTECUAD",
  "INGRESOCUAD",
  "RESUELTOCUAD",
  "PENDIENTEEXH",
  "INGRESOEXH",
  "RESUELTOEXH",
] as const;

const NUMERIC_COLS_LOWER = NUMERIC_COLUMNS.map((c) => c.toLowerCase());
const COLUMNS = `anio, mes, distrito_judicial, provincia, distrito, codigo_dependencia, dependencia,
       estado, tipo_organo, espec_exp, espec_dep, condicion, ${NUMERIC_COLS_LOWER.join(", ")}`;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function toResultado(r: Record<string, unknown>, ubigeo: string | null) {
  const conteos: Record<string, number> = {};
  for (const col of NUMERIC_COLS_LOWER) conteos[col] = Number(r[col]);
  return {
    anio: r.anio,
    mes: r.mes,
    distritoJudicial: r.distrito_judicial,
    provincia: r.provincia,
    distrito: r.distrito,
    ubigeo,
    codigoDependencia: r.codigo_dependencia,
    dependencia: r.dependencia,
    estado: r.estado,
    tipoOrgano: r.tipo_organo,
    especExp: r.espec_exp,
    especDep: r.espec_dep,
    condicion: r.condicion,
    conteos,
  };
}

// Mismo mapeo que `normalizeTerritoryToken` de ceplan-geo (duplicado a
// propósito: apps independientes, sin import cruzado de src/).
const ACCENT_MAP: Record<string, string> = { Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ñ: "N", Ü: "U" };
function normalizeToken(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑÜ]/g, (ch) => ACCENT_MAP[ch] ?? ch)
    .replace(/\s+/g, " ");
}

/**
 * `ubigeo` se resuelve vía `territory_name_crosswalk` de ceplan-geo
 * (cross-app, opcional). Si la base no está configurada (`crossAppPool`
 * devuelve null) o la consulta falla, se degrada a `ubigeo: null` en vez de
 * tumbar el endpoint — igual que `fetchUbigeoByProvinciaDistrito` de
 * `apps/poder-judicial/api/src/routes/procesos-judiciales.ts`.
 */
async function fetchUbigeoByProvinciaDistrito(env: Record<string, unknown>): Promise<Map<string, string>> {
  const ceplanGeoDb = crossAppPool("ceplan-geo", env);
  if (!ceplanGeoDb) return new Map();
  try {
    const { rows } = await ceplanGeoDb.query<{ provincia: string | null; distrito: string | null; ubigeo: string }>(
      `SELECT provincia, distrito, ubigeo FROM territory_name_crosswalk
       WHERE source = 'poder-judicial' AND match_status = 'confirmada' AND ubigeo IS NOT NULL`
    );
    return new Map(rows.map((r) => [`${r.provincia ?? ""}|${r.distrito ?? ""}`, r.ubigeo]));
  } catch (err) {
    console.error("No se pudo enriquecer con ubigeo (ceplan-geo no disponible):", err instanceof Error ? err.message : err);
    return new Map();
  }
}

/**
 * Handler para `poder_judicial_procesos` — GET /api/procesos-judiciales.
 * SQL idéntico al de `apps/poder-judicial/api/src/routes/procesos-judiciales.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args, env } = ctx;

  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const mes = args.mes as string | undefined;
  const distritoJudicial = args.distritoJudicial as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const tipoOrgano = args.tipoOrgano as string | undefined;
  const especExp = args.especExp as string | undefined;
  const condicion = args.condicion as string | undefined;
  const estado = args.estado as string | undefined;
  const dependencia = args.dependencia as string | undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (anio) {
    params.push(anio);
    conditions.push(`anio = $${params.length}`);
  }
  if (mes) {
    params.push(mes);
    conditions.push(`mes = $${params.length}`);
  }
  if (distritoJudicial) {
    params.push(distritoJudicial);
    conditions.push(`distrito_judicial = $${params.length}`);
  }
  if (provincia) {
    params.push(provincia.toUpperCase());
    conditions.push(`provincia = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`distrito = $${params.length}`);
  }
  if (tipoOrgano) {
    params.push(tipoOrgano);
    conditions.push(`tipo_organo = $${params.length}`);
  }
  if (especExp) {
    params.push(especExp);
    conditions.push(`espec_exp = $${params.length}`);
  }
  if (condicion) {
    params.push(condicion);
    conditions.push(`condicion = $${params.length}`);
  }
  if (estado) {
    params.push(estado);
    conditions.push(`estado = $${params.length}`);
  }
  if (dependencia) {
    params.push(`%${dependencia}%`);
    conditions.push(`dependencia ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM procesos_judiciales_jurisdiccional ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows } = await db.query<NeonRow>(
    `SELECT ${COLUMNS} FROM procesos_judiciales_jurisdiccional ${where}
     ORDER BY distrito_judicial, dependencia
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const ubigeoByProvinciaDistrito = await fetchUbigeoByProvinciaDistrito(env);

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) =>
        toResultado(r, ubigeoByProvinciaDistrito.get(`${normalizeToken(r.provincia as string | null)}|${normalizeToken(r.distrito as string | null)}`) ?? null)
      ),
    },
  };
}

const GROUP_BY_COLUMNS: Record<string, string> = {
  distritoJudicial: "distrito_judicial",
  tipoOrgano: "tipo_organo",
  especExp: "espec_exp",
  anio: "anio",
  mes: "mes",
  estado: "estado",
  condicion: "condicion",
};

const RESUMEN_COLUMNS = ["pendiente", "resuelto", "ingreso_sin", "ingreso_con", "sentencia", "conciliado"] as const;

/**
 * Handler para `poder_judicial_procesos_resumen` — GET /api/procesos-judiciales/resumen.
 * SQL idéntico al de `apps/poder-judicial/api/src/routes/procesos-judiciales.ts`.
 */
export async function resumen(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const groupBy = args.groupBy as string;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const mes = args.mes as string | undefined;
  const distritoJudicial = args.distritoJudicial as string | undefined;

  const groupCol = GROUP_BY_COLUMNS[groupBy];
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (anio) {
    params.push(anio);
    conditions.push(`anio = $${params.length}`);
  }
  if (mes) {
    params.push(mes);
    conditions.push(`mes = $${params.length}`);
  }
  if (distritoJudicial) {
    params.push(distritoJudicial);
    conditions.push(`distrito_judicial = $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sumCols = RESUMEN_COLUMNS.map((c) => `SUM(${c})::bigint AS ${c}`).join(", ");
  const { rows } = await db.query<NeonRow>(
    `SELECT ${groupCol} AS grupo, COUNT(*)::bigint AS filas, ${sumCols}
     FROM procesos_judiciales_jurisdiccional ${where}
     GROUP BY ${groupCol}
     ORDER BY grupo`,
    params
  );

  return {
    status: 200,
    body: {
      groupBy,
      porGrupo: rows.map((r) => ({
        grupo: r.grupo,
        filas: Number(r.filas),
        ...Object.fromEntries(RESUMEN_COLUMNS.map((c) => [c, Number(r[c])])),
      })),
    },
  };
}

/**
 * Handler para `poder_judicial_territorios` — GET /api/procesos-judiciales/territorios.
 * SQL idéntico al de `apps/poder-judicial/api/src/routes/procesos-judiciales.ts`.
 */
export async function territorios(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<NeonRow>(
    `SELECT provincia, distrito, COUNT(*)::bigint AS filas
      FROM procesos_judiciales_jurisdiccional
      GROUP BY provincia, distrito
      ORDER BY provincia, distrito`
  );

  return {
    status: 200,
    body: {
      total: rows.length,
      territorios: rows.map((r) => ({ provincia: r.provincia, distrito: r.distrito, filas: Number(r.filas) })),
    },
  };
}

const CRIMEN_ORGANIZADO_COLUMNS = ["pendiente", "resuelto", "ingreso_sin", "ingreso_con", "sentencia"] as const;

/**
 * Handler para `poder_judicial_crimen_organizado` — GET /api/procesos-judiciales/crimen-organizado.
 * SQL idéntico al de `apps/poder-judicial/api/src/routes/procesos-judiciales.ts`.
 */
export async function crimenOrganizado(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const distritoJudicial = args.distritoJudicial as string | undefined;
  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [`dependencia ILIKE '%Crimen Organizado%'`];
  const params: unknown[] = [];

  if (anio) {
    params.push(anio);
    conditions.push(`$${params.length} = anio`);
  }
  if (distritoJudicial) {
    params.push(distritoJudicial);
    conditions.push(`distrito_judicial = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const sumCols = CRIMEN_ORGANIZADO_COLUMNS.map((c) => `SUM(${c})::bigint AS ${c}`).join(", ");

  const countResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM procesos_judiciales_jurisdiccional ${where}`,
    params
  );

  const { rows } = await db.query<NeonRow>(
    `SELECT distrito_judicial, anio, COUNT(*)::bigint AS filas, ${sumCols}
     FROM procesos_judiciales_jurisdiccional ${where}
     GROUP BY distrito_judicial, anio
     ORDER BY distrito_judicial, anio
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const total = Number(countResult.rows[0].total);

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      porDistritoJudicial: rows.map((r) => ({
        distritoJudicial: r.distrito_judicial,
        anio: Number(r.anio),
        filas: Number(r.filas),
        ...Object.fromEntries(CRIMEN_ORGANIZADO_COLUMNS.map((c) => [c, Number(r[c])])),
      })),
    },
  };
}
