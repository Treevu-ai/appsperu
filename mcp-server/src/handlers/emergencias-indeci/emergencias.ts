import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SELECT_COLUMNS = `
  id, sinpad_id, fecha_emergencia, anio, mes, cod_distrito, departamento, provincia, distrito,
  peligro, tipo_peligro, region_natural, fallecidos, desaparecidos, lesionados, damnificados,
  afectados, viviendas_destruidas, viviendas_afectadas, peso_ayuda, costo_ayuda, detalle_edan
`;

interface EmergenciaRow extends NeonRow {
  id: number;
  sinpad_id: string | null;
  fecha_emergencia: string | null;
  anio: number | null;
  mes: number | null;
  cod_distrito: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  peligro: string | null;
  tipo_peligro: string | null;
  region_natural: string | null;
  fallecidos: number | null;
  desaparecidos: number | null;
  lesionados: number | null;
  damnificados: number | null;
  afectados: number | null;
  viviendas_destruidas: number | null;
  viviendas_afectadas: number | null;
  peso_ayuda: number | string | null;
  costo_ayuda: number | string | null;
  detalle_edan: unknown;
}

function toApiShape(r: EmergenciaRow) {
  return {
    id: r.id,
    sinpadId: r.sinpad_id,
    fechaEmergencia: r.fecha_emergencia,
    anio: r.anio,
    mes: r.mes,
    codDistrito: r.cod_distrito,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    peligro: r.peligro,
    tipoPeligro: r.tipo_peligro,
    regionNatural: r.region_natural,
    fallecidos: r.fallecidos,
    desaparecidos: r.desaparecidos,
    lesionados: r.lesionados,
    damnificados: r.damnificados,
    afectados: r.afectados,
    viviendasDestruidas: r.viviendas_destruidas,
    viviendasAfectadas: r.viviendas_afectadas,
    pesoAyuda: r.peso_ayuda,
    costoAyuda: r.costo_ayuda,
    detalleEdan: r.detalle_edan,
  };
}

/**
 * Handler para `emergencias_indeci` — GET /api/emergencias.
 *
 * SQL idéntico a `apps/emergencias-indeci/api/src/routes/emergencias.ts`. La
 * ruta Express corre count + página dentro de una única transacción
 * REPEATABLE READ para no mezclar snapshots si una ingesta corre en
 * paralelo; `NeonPool.query` no expone un cliente transaccional (abre y
 * cierra una conexión por llamada, ver docblock de `NeonPool`), así que acá
 * corren como dos `db.query` secuenciales — mismo patrón que el resto de
 * handlers portados (ej. `radar-ejecucion/execution.ts`).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const peligro = args.peligro as string | undefined;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (departamento) conditions.push(`departamento = ${addParam(departamento)}`);
  if (provincia) conditions.push(`provincia = ${addParam(provincia)}`);
  if (distrito) conditions.push(`distrito = ${addParam(distrito)}`);
  if (peligro) conditions.push(`peligro = ${addParam(peligro)}`);
  if (anio !== undefined) conditions.push(`anio = ${addParam(anio)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM indeci_emergencias WHERE ${whereSql}`,
    params
  );

  const { rows } = await db.query<EmergenciaRow>(
    `SELECT ${SELECT_COLUMNS} FROM indeci_emergencias
     WHERE ${whereSql}
     ORDER BY fecha_emergencia DESC NULLS LAST, id DESC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    listParams
  );

  const total = Number(countRows[0].total);

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toApiShape),
      fuente: {
        dataset: "INDECI - Emergencias y daños a nivel nacional por departamento (SINPAD, 2003-2025)",
        nota: "sinpadId NO es una clave única (7 códigos repetidos entre eventos distintos, confirmado en vivo, pese a que la fuente lo documenta como clave primaria) -- usar el id interno para referenciar una fila específica.",
      },
    },
  };
}

/**
 * Handler para `emergencias_indeci_detalle` — GET /api/emergencias/{id}.
 * SQL idéntico a `apps/emergencias-indeci/api/src/routes/emergencias.ts`.
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const id = Number(args.id);

  const { rows } = await db.query<EmergenciaRow>(
    `SELECT ${SELECT_COLUMNS} FROM indeci_emergencias WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Emergencia no encontrada." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
