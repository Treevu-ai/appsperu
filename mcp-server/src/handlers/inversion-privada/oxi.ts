import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface OxiRow extends NeonRow {
  oxi_id: number;
  fase: string;
  tipo_inversion: string;
  nivel_estudio: string;
  nivel_gobierno: string;
  departamento: string;
  provincia: string;
  distrito: string;
  entidad: string;
  codigo_referencia: string | null;
  nombre_proyecto: string;
  funcion: string;
  tipologia: string;
  monto_inversion_referencial: number | string | null;
  rango_monto: string | null;
  fetched_at: string;
}

/**
 * Handler para `inversion_privada_oxi_projects` — GET /api/oxi.
 *
 * SQL idéntico a `apps/inversion-privada/api/src/routes/oxi.ts`.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = args.departamento as string | undefined;
  const funcion = args.funcion as string | undefined;
  const fase = args.fase as string | undefined;
  const entidad = args.entidad as string | undefined;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (departamento) {
    values.push(departamento.trim());
    conditions.push(`o.departamento ILIKE $${values.length}`);
  }
  if (funcion) {
    values.push(funcion);
    conditions.push(`o.funcion ILIKE $${values.length}`);
  }
  if (fase) {
    values.push(fase);
    conditions.push(`o.fase ILIKE $${values.length}`);
  }
  if (entidad) {
    values.push(`%${entidad}%`);
    conditions.push(`o.entidad ILIKE $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await db.query<OxiRow>(
    `SELECT o.oxi_id, o.fase, o.tipo_inversion, o.nivel_estudio, o.nivel_gobierno,
            o.departamento, o.provincia, o.distrito, o.entidad, o.codigo_referencia,
            o.nombre_proyecto, o.funcion, o.tipologia, o.monto_inversion_referencial,
            o.rango_monto, rb.fetched_at
     FROM oxi_investment_promotions o
     JOIN raw_oxi_batches rb ON rb.id = o.source_batch_id
     ${where}
     ORDER BY o.monto_inversion_referencial DESC NULLS LAST, o.nombre_proyecto
     LIMIT 1000`,
    values,
  );

  const { rows: metaRows } = await db.query<{ records_total: number; fetched_at: string }>(
    `SELECT records_total, fetched_at FROM raw_oxi_batches ORDER BY fetched_at DESC LIMIT 1`,
  );
  const latest = metaRows[0];

  return {
    status: 200,
    body: {
      resultados: rows.map((r) => ({
        oxiId: r.oxi_id,
        fase: r.fase,
        tipoInversion: r.tipo_inversion,
        nivelEstudio: r.nivel_estudio,
        nivelGobierno: r.nivel_gobierno,
        departamento: r.departamento,
        provincia: r.provincia,
        distrito: r.distrito,
        entidad: r.entidad,
        codigoReferencia: r.codigo_referencia,
        nombreProyecto: r.nombre_proyecto,
        funcion: r.funcion,
        tipologia: r.tipologia,
        montoInversionReferencialSoles: r.monto_inversion_referencial === null ? null : Number(r.monto_inversion_referencial),
        rangoMonto: r.rango_monto,
        fuente: {
          dataset: "PROINVERSIÓN / VERTIX — OxI (investmentpromotionExport.php)",
          extraidoEl: r.fetched_at,
        },
      })),
      cobertura: "oxi_inversiones_en_promocion",
      isPartial: latest ? rows.length < latest.records_total : true,
      recordsTotalFuente: latest?.records_total ?? null,
      extraidoEl: latest?.fetched_at ?? null,
    },
  };
}

/**
 * Handler para `inversion_privada_oxi_by_id` — GET /api/oxi/{oxiId}.
 */
export async function byId(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const oxiId = Number(args.oxiId);
  if (!Number.isInteger(oxiId) || oxiId <= 0) {
    return { status: 400, body: { error: "oxiId inválido." } };
  }

  const { rows } = await db.query<OxiRow>(
    `SELECT o.*, rb.fetched_at
     FROM oxi_investment_promotions o
     JOIN raw_oxi_batches rb ON rb.id = o.source_batch_id
     WHERE o.oxi_id = $1`,
    [oxiId],
  );

  if (rows.length === 0) {
    return { status: 404, body: { error: "Proyecto OxI no encontrado." } };
  }

  const r = rows[0];
  return {
    status: 200,
    body: {
      oxiId: r.oxi_id,
      fase: r.fase,
      tipoInversion: r.tipo_inversion,
      nivelEstudio: r.nivel_estudio,
      nivelGobierno: r.nivel_gobierno,
      departamento: r.departamento,
      provincia: r.provincia,
      distrito: r.distrito,
      entidad: r.entidad,
      codigoReferencia: r.codigo_referencia,
      nombreProyecto: r.nombre_proyecto,
      funcion: r.funcion,
      tipologia: r.tipologia,
      montoInversionReferencialSoles: r.monto_inversion_referencial === null ? null : Number(r.monto_inversion_referencial),
      rangoMonto: r.rango_monto,
      fuente: { dataset: "PROINVERSIÓN / VERTIX — OxI", extraidoEl: r.fetched_at },
    },
  };
}
