import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface MunicipioRow extends NeonRow {
  id: number;
  anio: number;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

interface VehiculoRow extends NeonRow {
  item_codigo: string;
  item_descripcion: string;
  tiene: boolean | null;
  cantidad_operativa: number | string | null;
  cantidad_no_operativa: number | string | null;
  especifique: string | null;
}

interface ConectividadRow extends NeonRow {
  tiene_linea_fija: boolean | null;
  lineas_fijas: number | string | null;
  tiene_linea_movil: boolean | null;
  lineas_moviles: number | string | null;
  tiene_internet: boolean | null;
  computadoras_con_internet: number | string | null;
  tipo_conexion_codigo: string | null;
}

/**
 * Handler para `renamu_equipamiento` — GET /api/equipamiento.
 * SQL idéntico a `apps/renamu/api/src/routes/equipamiento.ts`.
 */
export async function get(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ubigeo = args.ubigeo as string;
  const anio = args.anio !== undefined ? Number(args.anio) : undefined;

  const municipioParams: unknown[] = [ubigeo];
  let municipioWhere = "m.ubigeo = $1";
  if (anio) {
    municipioParams.push(anio);
    municipioWhere += ` AND m.anio = $${municipioParams.length}`;
  }

  const { rows: municipios } = await db.query<MunicipioRow>(
    `SELECT m.id, m.anio, m.ubigeo, m.departamento, m.provincia, m.distrito
     FROM renamu_municipalidades m
     WHERE ${municipioWhere}
     ORDER BY m.anio DESC
     LIMIT 1`,
    municipioParams
  );

  if (municipios.length === 0) {
    return { status: 404, body: { error: "No hay datos de RENAMU para ese ubigeo/año." } };
  }

  const municipio = municipios[0];

  const { rows: vehiculos } = await db.query<VehiculoRow>(
    `SELECT item_codigo, item_descripcion, tiene, cantidad_operativa, cantidad_no_operativa, especifique
     FROM renamu_vehiculos
     WHERE municipio_id = $1
     ORDER BY item_codigo`,
    [municipio.id]
  );

  const { rows: conectividad } = await db.query<ConectividadRow>(
    `SELECT tiene_linea_fija, lineas_fijas, tiene_linea_movil, lineas_moviles,
            tiene_internet, computadoras_con_internet, tipo_conexion_codigo
     FROM renamu_conectividad
     WHERE municipio_id = $1`,
    [municipio.id]
  );

  return {
    status: 200,
    body: {
      municipalidad: {
        anio: municipio.anio,
        ubigeo: municipio.ubigeo,
        departamento: municipio.departamento,
        provincia: municipio.provincia,
        distrito: municipio.distrito,
      },
      vehiculos: vehiculos.map((v) => ({
        item: v.item_descripcion,
        tiene: v.tiene,
        cantidadOperativa: v.cantidad_operativa === null ? null : Number(v.cantidad_operativa),
        cantidadNoOperativa: v.cantidad_no_operativa === null ? null : Number(v.cantidad_no_operativa),
        especifique: v.especifique,
      })),
      conectividad: conectividad[0]
        ? {
            tieneLineaFija: conectividad[0].tiene_linea_fija,
            lineasFijas: conectividad[0].lineas_fijas === null ? null : Number(conectividad[0].lineas_fijas),
            tieneLineaMovil: conectividad[0].tiene_linea_movil,
            lineasMoviles: conectividad[0].lineas_moviles === null ? null : Number(conectividad[0].lineas_moviles),
            tieneInternet: conectividad[0].tiene_internet,
            computadorasConInternet:
              conectividad[0].computadoras_con_internet === null ? null : Number(conectividad[0].computadoras_con_internet),
            tipoConexionCodigo: conectividad[0].tipo_conexion_codigo,
          }
        : null,
      fuente: { dataset: "INEI - RENAMU (Módulo II: equipamiento y TIC)" },
    },
  };
}
