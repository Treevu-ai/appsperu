import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface CountRow extends NeonRow {
  total: string;
}

interface OECEFichaRow extends NeonRow {
  ruc: string;
  razon_social: string;
  tipo_empresa: string;
  estado_sunat: string;
  condicion_sunat: string;
  departamento: string;
  provincia: string;
  distrito: string;
  telefono: string;
  email: string;
  codigo_registro: string;
  fecha_consulta: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_oece_ficha` — GET /api/oece-ficha
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/oece-ficha.ts`.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const razonSocial = args.razonSocial as string | undefined;
  const departamento = args.departamento as string | undefined;
  const inscritoRnp = args.inscritoRnp as string | undefined;

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (departamento) {
    params.push(departamento.toUpperCase());
    conditions.push(`departamento = $${params.length}`);
  }
  if (inscritoRnp === "true") {
    conditions.push(`codigo_registro IS NOT NULL`);
  } else if (inscritoRnp === "false") {
    conditions.push(`codigo_registro IS NULL`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM ruc_oece_ficha ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<OECEFichaRow>(
    `SELECT ruc, razon_social, tipo_empresa, estado_sunat, condicion_sunat, departamento, provincia,
            distrito, telefono, email, codigo_registro, fecha_consulta
     FROM ruc_oece_ficha ${where}
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
      resultados: rows.map((r) => ({
        ruc: r.ruc,
        razonSocial: r.razon_social,
        tipoEmpresa: r.tipo_empresa,
        estadoSunat: r.estado_sunat,
        condicionSunat: r.condicion_sunat,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        telefono: r.telefono,
        email: r.email,
        codigoRegistro: r.codigo_registro,
        inscritoRnp: r.codigo_registro !== null,
        fechaConsulta: r.fecha_consulta,
      })),
    },
  };
}

/**
 * Handler para `identidad_fiscal_oece_ficha_by_ruc` — GET /api/oece-ficha/{ruc}
 */
export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const { rows } = await db.query<OECEFichaRow>(
    `SELECT ruc, razon_social, tipo_empresa, estado_sunat, condicion_sunat, departamento, provincia,
            distrito, telefono, email, codigo_registro, fecha_consulta
     FROM ruc_oece_ficha WHERE ruc = $1`,
    [ruc]
  );
  if (rows.length === 0) {
    return {
      status: 404,
      body: { error: "RUC no consultado todavía contra la Ficha de Proveedor de OECE." },
    };
  }

  const { rows: personas } = await db.query<NeonRow>(
    `SELECT rol, source_id, dni, nombre, tipo_organo, cargo, fecha_ingreso
     FROM ruc_oece_personas WHERE ruc = $1
     ORDER BY rol, source_id`,
    [ruc]
  );

  const r = rows[0];
  return {
    status: 200,
    body: {
      ruc: r.ruc,
      razonSocial: r.razon_social,
      tipoEmpresa: r.tipo_empresa,
      estadoSunat: r.estado_sunat,
      condicionSunat: r.condicion_sunat,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      telefono: r.telefono,
      email: r.email,
      codigoRegistro: r.codigo_registro,
      inscritoRnp: r.codigo_registro !== null,
      fechaConsulta: r.fecha_consulta,
      personas: personas.map((p) => ({
        rol: p.rol,
        sourceId: Number(p.source_id),
        dni: p.dni,
        nombre: p.nombre,
        tipoOrgano: p.tipo_organo,
        cargo: p.cargo,
        fechaIngreso: p.fecha_ingreso,
      })),
    },
  };
}