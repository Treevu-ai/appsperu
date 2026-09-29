import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SELECT_COLUMNS = `
  capa, objectid, fuente, doc_reg, fec_reg, observ, zon_utm, origen,
  nom_dis, nom_pro, nom_dep, aut_for, fec_ini, fec_ter, situac, sup_sig,
  sup_apr, doc_leg, fec_leg, atributos_extra
`;

interface TituloRow extends NeonRow {
  capa: string;
  objectid: number;
  fuente: string | null;
  doc_reg: string | null;
  fec_reg: string | null;
  observ: string | null;
  zon_utm: string | null;
  origen: string | null;
  nom_dis: string | null;
  nom_pro: string | null;
  nom_dep: string | null;
  aut_for: string | null;
  fec_ini: string | null;
  fec_ter: string | null;
  situac: string | null;
  sup_sig: number | string | null;
  sup_apr: number | string | null;
  doc_leg: string | null;
  fec_leg: string | null;
  atributos_extra: unknown;
}

function toApiShape(r: TituloRow) {
  return {
    capa: r.capa,
    objectid: r.objectid,
    fuente: r.fuente,
    docReg: r.doc_reg,
    fecReg: r.fec_reg,
    observ: r.observ,
    zonUtm: r.zon_utm,
    origen: r.origen,
    nomDis: r.nom_dis,
    nomPro: r.nom_pro,
    nomDep: r.nom_dep,
    autFor: r.aut_for,
    fecIni: r.fec_ini,
    fecTer: r.fec_ter,
    situac: r.situac,
    supSig: r.sup_sig,
    supApr: r.sup_apr,
    docLeg: r.doc_leg,
    fecLeg: r.fec_leg,
    atributosExtra: r.atributos_extra,
  };
}

/**
 * Handler para `catastro_forestal_titulos` — GET /api/titulos.
 *
 * SQL idéntico a `apps/catastro-forestal/api/src/routes/titulos.ts`. La ruta
 * Express corre count + página dentro de una transacción REPEATABLE READ
 * (mismo criterio que `senace-cartera-proyectos`) para no mezclar snapshots
 * si una ingesta corre en paralelo; `NeonPool.query` no expone un cliente
 * transaccional (abre y cierra una conexión por llamada), así que acá corren
 * como dos `db.query` secuenciales — mismo patrón que el resto de handlers
 * portados (ej. `emergencias-indeci/emergencias.ts`).
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string | undefined;
  const nomDep = args.nomDep as string | undefined;
  const nomPro = args.nomPro as string | undefined;
  const nomDis = args.nomDis as string | undefined;
  const limit = Math.min(args.limit !== undefined ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset !== undefined ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (capa) conditions.push(`capa = ${addParam(capa)}`);
  if (nomDep) conditions.push(`nom_dep = ${addParam(nomDep)}`);
  if (nomPro) conditions.push(`nom_pro = ${addParam(nomPro)}`);
  if (nomDis) conditions.push(`nom_dis = ${addParam(nomDis)}`);

  const whereSql = conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
  const listParams = [...params];
  const limitPlaceholder = `$${listParams.push(limit)}`;
  const offsetPlaceholder = `$${listParams.push(offset)}`;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM catastro_forestal_titulos WHERE ${whereSql}`,
    params
  );

  const { rows } = await db.query<TituloRow>(
    `SELECT ${SELECT_COLUMNS} FROM catastro_forestal_titulos
     WHERE ${whereSql}
     ORDER BY capa, objectid
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
        dataset: "SERFOR - Catastro Forestal (Modalidad de Acceso + Ordenamiento Forestal)",
        nota: "nomDep es siempre un código UBIGEO numérico. nomPro/nomDis son códigos UBIGEO en 9 de 10 capas, pero nombres reales de texto en modalidad_autorizacion_cambio_uso_agropecuario (inconsistencia real de la fuente). Cruzar los códigos contra una tabla UBIGEO para mostrar nombres. objectid NO es una clave única global -- solo identifica una fila dentro de su propia capa. Cada capa es un snapshot completo reemplazado en cada ingesta.",
      },
    },
  };
}

/**
 * Handler para `catastro_forestal_titulo_detalle` — GET /api/titulos/{capa}/{objectid}.
 * SQL idéntico a `apps/catastro-forestal/api/src/routes/titulos.ts`.
 */
export async function detalle(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const capa = args.capa as string;
  const objectid = Number(args.objectid);

  const { rows } = await db.query<TituloRow>(
    `SELECT ${SELECT_COLUMNS} FROM catastro_forestal_titulos WHERE capa = $1 AND objectid = $2`,
    [capa, objectid]
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Título no encontrado." } };
  }

  return { status: 200, body: toApiShape(rows[0]) };
}
