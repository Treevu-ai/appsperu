import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface TraficoRow extends NeonRow {
  anio: number;
  mes: number;
  entidad_prestadora: string;
  concesion: string | null;
  siglas_concesion: string | null;
  peaje: string | null;
  clase_vehiculo: string | null;
  tipo_tarifa: string | null;
  tipo_vehiculo: string | null;
  tipo_eje_veh: string | null;
  nro_ejes: string | null;
  cantidad_vehiculos: number | string;
}

/**
 * Handler para `ositran_reclamos_trafico` — tráfico vehicular por peaje en
 * carreteras concesionadas. Origen: apps/ositran-reclamos/api/src/ingest/ositran-connector.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const anio = args.anio ? Number(args.anio) : undefined;
  const mes = args.mes ? Number(args.mes) : undefined;
  const siglasConcesion = args.siglasConcesion as string | undefined;
  const peaje = args.peaje as string | undefined;
  const limit = args.limit ? Number(args.limit) : 200;
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  const addEq = (column: string, value: unknown) => {
    params.push(value);
    conditions.push(`${column} = $${params.length}`);
  };
  const addIlike = (column: string, value: string) => {
    params.push(`%${value}%`);
    conditions.push(`${column} ILIKE $${params.length}`);
  };

  if (anio !== undefined) addEq("anio", anio);
  if (mes !== undefined) addEq("mes", mes);
  if (siglasConcesion) addEq("siglas_concesion", siglasConcesion);
  if (peaje) addIlike("peaje", peaje);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM trafico_vehicular_carreteras ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await db.query<TraficoRow>(
    `SELECT anio, mes, entidad_prestadora, concesion, siglas_concesion, peaje, clase_vehiculo,
            tipo_tarifa, tipo_vehiculo, tipo_eje_veh, nro_ejes, cantidad_vehiculos
     FROM trafico_vehicular_carreteras
     ${where}
     ORDER BY anio DESC, mes DESC, siglas_concesion
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
        anio: r.anio,
        mes: r.mes,
        entidadPrestadora: r.entidad_prestadora,
        concesion: r.concesion,
        siglasConcesion: r.siglas_concesion,
        peaje: r.peaje,
        claseVehiculo: r.clase_vehiculo,
        tipoTarifa: r.tipo_tarifa,
        tipoVehiculo: r.tipo_vehiculo,
        tipoEjeVeh: r.tipo_eje_veh,
        nroEjes: r.nro_ejes,
        cantidadVehiculos: Number(r.cantidad_vehiculos),
      })),
      fuente: { dataset: "OSITRAN - Tráfico Vehicular en Carreteras Concesionadas" },
    },
  };
}
