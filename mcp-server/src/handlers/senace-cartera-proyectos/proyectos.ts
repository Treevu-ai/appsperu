import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const SELECT_COLUMNS = `
  senace_id, titular, ruc, titulo_proyecto, unidad_proyecto, tipo, actividad,
  fecha_inicio, estado, descripcion, longitud, latitud, resolucion
`;

interface ProyectoRow extends NeonRow {
  senace_id: number;
  titular: string;
  ruc: string | null;
  titulo_proyecto: string;
  unidad_proyecto: string | null;
  tipo: string;
  actividad: string;
  fecha_inicio: string | null;
  estado: string;
  descripcion: string | null;
  longitud: number | string | null;
  latitud: number | string | null;
  resolucion: string | null;
}

function toApiShape(r: ProyectoRow) {
  return {
    senaceId: r.senace_id,
    titular: r.titular,
    ruc: r.ruc,
    tituloProyecto: r.titulo_proyecto,
    unidadProyecto: r.unidad_proyecto,
    tipo: r.tipo,
    actividad: r.actividad,
    fechaInicio: r.fecha_inicio,
    estado: r.estado,
    descripcion: r.descripcion,
    longitud: r.longitud,
    latitud: r.latitud,
    resolucion: r.resolucion,
  };
}

/**
 * Handler para `senace_cartera_proyectos` — GET /api/proyectos.
 *
 * Origen: apps/senace-cartera-proyectos/api/src/routes/proyectos.ts. El route
 * Express corre COUNT + listado dentro de una transacción
 * `REPEATABLE READ` para que ambas vean el mismo snapshot (evita que
 * `hasMore` quede inconsistente si una ingesta corre en paralelo) — `NeonPool`
 * de este Worker no expone un cliente transaccional reutilizable (abre/cierra
 * una conexión por `query`), así que aquí las dos consultas van secuenciales
 * sin transacción explícita: mismo resultado en el caso normal (sin ingesta
 * concurrente), con la misma ventana de inconsistencia teórica que ya acepta
 * el resto del catálogo para listado+conteo no transaccional.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const estado = args.estado as string | undefined;
  const actividad = args.actividad as string | undefined;
  const ruc = args.ruc as string | undefined;
  const texto = args.texto as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

  if (estado) conditions.push(`estado = ${addParam(estado)}`);
  if (actividad) addIlike("actividad", actividad);
  if (ruc) conditions.push(`ruc = ${addParam(ruc)}`);
  if (texto) {
    const placeholder = addParam(`%${texto}%`);
    conditions.push(`(titulo_proyecto ILIKE ${placeholder} OR titular ILIKE ${placeholder})`);
  }

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM senace_cartera_proyectos WHERE ${whereSql}`,
    params
  );
  const { rows } = await db.query<ProyectoRow>(
    `SELECT ${SELECT_COLUMNS} FROM senace_cartera_proyectos
     WHERE ${whereSql}
     ORDER BY senace_id DESC
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
        dataset: "SENACE - Cartera de Proyectos (portal público de datos abiertos, sin autenticación)",
        nota: "No incluye proyectos gestionados solo por la API gateada de SENACE (/Api/), que requiere un auth_key que no poseemos. Ver docs/data-contracts/senace-cartera-proyectos.md.",
      },
    },
  };
}

/**
 * Handler para `senace_cartera_proyecto_detalle` — GET /api/proyectos/{senaceId}.
 * Origen: apps/senace-cartera-proyectos/api/src/routes/proyectos.ts (segunda ruta).
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const senaceId = Number(args.senaceId);

  const { rows } = await db.query<ProyectoRow>(`SELECT ${SELECT_COLUMNS} FROM senace_cartera_proyectos WHERE senace_id = $1`, [
    senaceId,
  ]);

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proyecto no encontrado." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
