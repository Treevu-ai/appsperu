import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface PrecioRow extends NeonRow {
  registro_hidrocarburos: string | null;
  ruc: string | null;
  razon_social: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  departamento_reparto: string | null;
  provincia_reparto: string | null;
  fecha_registro: string | null;
  producto: string;
  precio_min_soles: number | string | null;
  precio_max_soles: number | string | null;
  unidad: string | null;
}

/**
 * Handler para `osinergmin_combustibles_precios` — reporte diario SCOP de
 * precios registrados por distribuidores minoristas de combustibles líquidos.
 * Origen: apps/osinergmin-combustibles/api/src/ingest/precios-combustibles-connector.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const producto = args.producto as string | undefined;
  const ruc = args.ruc as string | undefined;
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
  if (producto) addIlike("producto", producto);
  if (ruc) addEq("ruc", ruc);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM precios_combustibles_distribuidores ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<PrecioRow>(
    `SELECT registro_hidrocarburos, ruc, razon_social, departamento, provincia, distrito,
            direccion, departamento_reparto, provincia_reparto, fecha_registro, producto,
            precio_min_soles, precio_max_soles, unidad
     FROM precios_combustibles_distribuidores
     ${where}
     ORDER BY departamento, producto, razon_social
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
        registroHidrocarburos: r.registro_hidrocarburos,
        ruc: r.ruc,
        razonSocial: r.razon_social,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        direccion: r.direccion,
        departamentoReparto: r.departamento_reparto,
        provinciaReparto: r.provincia_reparto,
        fechaRegistro: r.fecha_registro,
        producto: r.producto,
        precioMinSoles: r.precio_min_soles === null ? null : Number(r.precio_min_soles),
        precioMaxSoles: r.precio_max_soles === null ? null : Number(r.precio_max_soles),
        unidad: r.unidad,
      })),
      fuente: {
        dataset: "OSINERGMIN - SCOP, Registro de precios de Distribuidores Minoristas de Combustibles Líquidos",
        nota: "Precio registrado por el propio distribuidor minorista, no precio al consumidor final en grifo.",
      },
    },
  };
}
