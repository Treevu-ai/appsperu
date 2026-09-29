import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface ProyectoRow extends NeonRow {
  per_par_id: number;
  pley_num: number;
  proyecto_ley: string;
  estado: string;
  fecha_presentacion: string | null;
  titulo: string;
  proponente: string | null;
  autores: string | null;
  cod_tipo_parl: string | null;
  cod_tipo_parl_actual: string | null;
}

interface PeriodoRow extends NeonRow {
  per_par_id: number;
  ultima_ingesta: string;
  proyectos_en_ultima_ingesta: string;
}

function toApiShape(r: ProyectoRow) {
  return {
    perParId: r.per_par_id,
    pleyNum: r.pley_num,
    proyectoLey: r.proyecto_ley,
    estado: r.estado,
    fechaPresentacion: r.fecha_presentacion,
    titulo: r.titulo,
    proponente: r.proponente,
    autores: r.autores,
    codTipoParl: r.cod_tipo_parl,
    codTipoParlActual: r.cod_tipo_parl_actual,
  };
}

/**
 * Handler para `legislativo_congreso_proyectos` — GET /api/proyectos.
 * SQL idéntico a `apps/legislativo-congreso/api/src/routes/proyectos.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const periodo = args.periodo !== undefined ? Number(args.periodo) : undefined;
  const estado = args.estado as string | undefined;
  const autor = args.autor as string | undefined;
  const texto = args.texto as string | undefined;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addIlike = (column: string, value: string) => conditions.push(`${column} ILIKE ${addParam(`%${value}%`)}`);

  if (periodo !== undefined) conditions.push(`per_par_id = ${addParam(periodo)}`);
  if (estado) conditions.push(`estado = ${addParam(estado)}`);
  if (autor) addIlike("autores", autor);
  if (texto) addIlike("titulo", texto);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM legislativo_congreso_proyectos WHERE ${whereSql}`, params),
    db.query<ProyectoRow>(
      `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores, cod_tipo_parl, cod_tipo_parl_actual
       FROM legislativo_congreso_proyectos
       WHERE ${whereSql}
       ORDER BY per_par_id DESC, pley_num DESC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      listParams
    ),
  ]);

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
        dataset: "Congreso de la República - Proyectos de Ley (spley-portal-service)",
        nota: "Un resultado vacío para un periodo que aparece en GET /api/proyectos/periodos significa 'sin match para el filtro'; un periodo ausente de esa lista significa 'no ingerido todavía', no 'cero proyectos confirmados'. Ver GET /api/proyectos/periodos.",
      },
    },
  };
}

/**
 * Handler para `legislativo_congreso_periodos` — GET /api/proyectos/periodos.
 * SQL idéntico a `apps/legislativo-congreso/api/src/routes/proyectos.ts`.
 */
export async function periodos(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<PeriodoRow>(
    `SELECT DISTINCT ON (per_par_id) per_par_id, fetched_at AS ultima_ingesta, record_count AS proyectos_en_ultima_ingesta
     FROM raw_congreso_batches
     ORDER BY per_par_id DESC, fetched_at DESC, id DESC`
  );

  return {
    status: 200,
    body: {
      periodos: rows.map((r) => ({
        perParId: r.per_par_id,
        disponible: true,
        ultimaIngesta: r.ultima_ingesta,
        proyectosEnUltimaIngesta: Number(r.proyectos_en_ultima_ingesta),
      })),
      nota: "Cualquier perParId que no aparezca en esta lista es 'no_disponible' -- nunca se ha ingerido, no tiene cero proyectos confirmados.",
    },
  };
}

/**
 * Handler para `legislativo_congreso_proyecto_detalle` — GET /api/proyectos/{periodo}/{numero}.
 * SQL idéntico a `apps/legislativo-congreso/api/src/routes/proyectos.ts`.
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const periodo = Number(args.periodo);
  const numero = Number(args.numero);

  const { rows } = await db.query<ProyectoRow>(
    `SELECT per_par_id, pley_num, proyecto_ley, estado, fecha_presentacion, titulo, proponente, autores, cod_tipo_parl, cod_tipo_parl_actual
     FROM legislativo_congreso_proyectos
     WHERE per_par_id = $1 AND pley_num = $2`,
    [periodo, numero]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proyecto no encontrado." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
