import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface GrifoRow extends NeonRow {
  expediente: string;
  codigo_osinergmin: string | null;
  registro: string | null;
  ruc: string | null;
  razon_social: string;
  direccion_operativa: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  tipo_establecimiento: string | null;
  capacidad_total_cl_gln: number | string | null;
  fecha_emision: string | null;
  termino_vigencia: string | null;
  representante: string | null;
}

/**
 * Handler para `osinergmin_combustibles_grifos` — registro de grifos y
 * estaciones de servicio. Origen: apps/osinergmin-combustibles/api/src/ingest/osinergmin-connector.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const ruc = args.ruc as string | undefined;
  const tipoEstablecimiento = args.tipoEstablecimiento as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };
  const addEq = (column: string, value: string) => {
    params.push(value);
    conditions.push(`${column} = $${params.length}`);
  };

  if (departamento) addIlike("departamento", departamento);
  if (provincia) addIlike("provincia", provincia);
  if (distrito) addIlike("distrito", distrito);
  if (ruc) addEq("ruc", ruc);
  if (tipoEstablecimiento) addIlike("tipo_establecimiento", tipoEstablecimiento);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM grifos_estaciones ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<GrifoRow>(
    `SELECT expediente, codigo_osinergmin, registro, ruc, razon_social, direccion_operativa,
            departamento, provincia, distrito, tipo_establecimiento, capacidad_total_cl_gln,
            fecha_emision, termino_vigencia, representante
     FROM grifos_estaciones
     ${where}
     ORDER BY departamento, provincia, razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map((r) => ({
        expediente: r.expediente,
        codigoOsinergmin: r.codigo_osinergmin,
        registro: r.registro,
        ruc: r.ruc,
        razonSocial: r.razon_social,
        direccionOperativa: r.direccion_operativa,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        tipoEstablecimiento: r.tipo_establecimiento,
        capacidadTotalClGln: r.capacidad_total_cl_gln === null ? null : Number(r.capacidad_total_cl_gln),
        fechaEmision: r.fecha_emision,
        terminoVigencia: r.termino_vigencia,
        representante: r.representante,
      })),
      fuente: { dataset: "OSINERGMIN - Registro de Grifos y Estaciones de Servicio" },
    },
  };
}
