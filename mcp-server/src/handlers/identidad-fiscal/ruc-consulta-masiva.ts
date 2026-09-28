import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CountRow extends NeonRow {
  total: string;
}

const COLUMNS = `ruc, razon_social, tipo_contribuyente, profesion_oficio, nombre_comercial,
       condicion_contribuyente, estado_contribuyente, fecha_inscripcion, fechaInicio_actividades,
       departamento, provincia, distrito, direccion, telefono, fax, actividad_comercio_exterior,
       ciiu_principal, ciiu_secundario_1, ciiu_secundario_2, afecto_nuevo_rus, buen_contribuyente,
       agente_retencion, agente_percepcion_venta_interna, agente_percepcion_combustible, fecha_consulta`;

function toResultado(r: Record<string, unknown>) {
  return {
    ruc: r.ruc,
    razonSocial: r.razon_social,
    tipoContribuyente: r.tipo_contribuyente,
    profesionOficio: r.profesion_oficio,
    nombreComercial: r.nombre_comercial,
    condicionContribuyente: r.condicion_contribuyente,
    estadoContribuyente: r.estado_contribuyente,
    fechaInscripcion: r.fecha_inscripcion,
    fechaInicioActividades: r.fechaInicio_actividades,
    departamento: r.departamento,
    provincia: r.provincia,
    distrito: r.distrito,
    direccion: r.direccion,
    telefono: r.telefono,
    fax: r.fax,
    actividadComercioExterior: r.actividad_comercio_exterior,
    ciiuPrincipal: r.ciiu_principal,
    ciiuSecundario1: r.ciiu_secundario_1,
    ciiuSecundario2: r.ciiu_secundario_2,
    afectoNuevoRus: r.afecto_nuevo_rus,
    buenContribuyente: r.buen_contribuyente,
    agenteRetencion: r.agente_retencion,
    agentePercepcionVentaInterna: r.agente_percepcion_venta_interna,
    agentePercepcionCombustible: r.agente_percepcion_combustible,
    fechaConsulta: r.fecha_consulta,
  };
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_ruc_consulta_masiva` — GET /api/ruc-consulta-masiva
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/ruc-consulta-masiva.ts`.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const razonSocial = args.razonSocial as string | undefined;
  const estado = args.estado as string | undefined;
  const departamento = args.departamento as string | undefined;
  const provincia = args.provincia as string | undefined;
  const distrito = args.distrito as string | undefined;
  const buenContribuyente = args.buenContribuyente as string | undefined;

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (estado) {
    params.push(estado.toUpperCase());
    conditions.push(`estado_contribuyente = $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (provincia) {
    params.push(provincia.toUpperCase());
    conditions.push(`provincia = $${params.length}`);
  }
  if (distrito) {
    params.push(distrito.toUpperCase());
    conditions.push(`distrito = $${params.length}`);
  }
  if (buenContribuyente === "true") {
    conditions.push(`buen_contribuyente = 'SI'`);
  } else if (buenContribuyente === "false") {
    conditions.push(`(buen_contribuyente IS NULL OR buen_contribuyente <> 'SI')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM ruc_consulta_masiva ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<NeonRow>(
    `SELECT ${COLUMNS} FROM ruc_consulta_masiva ${where}
     ORDER BY razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const rows = dataResult.rows;

  return {
    status: 200,
    body: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
      resultados: rows.map(toResultado),
    },
  };
}

/**
 * Handler para `identidad_fiscal_ruc_consulta_masiva_by_ruc` — GET /api/ruc-consulta-masiva/{ruc}
 */
export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const { rows } = await db.query<NeonRow>(
    `SELECT ${COLUMNS} FROM ruc_consulta_masiva WHERE ruc = $1`,
    [ruc]
  );
  if (rows.length === 0) {
    return {
      status: 404,
      body: { error: "RUC no encontrado en la Consulta Múltiple ingerida." },
    };
  }
  return {
    status: 200,
    body: toResultado(rows[0]),
  };
}