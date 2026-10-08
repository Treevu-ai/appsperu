import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";
import { fetchRucLive } from "../../lib/openruc-client.js";

/** Caché del fallback en vivo: no re-consultar openruc.com antes de este tiempo. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RucLookupCacheRow extends NeonRow {
  ruc: string;
  razon_social: string;
  estado: string | null;
  condicion: string | null;
  direccion: string | null;
  ubigeo: string | null;
  as_of: string | null;
  consultado_en: string;
}

function cacheToApiShape(r: RucLookupCacheRow) {
  return {
    ruc: r.ruc,
    razonSocial: r.razon_social,
    estadoContribuyente: r.estado,
    condicionContribuyente: r.condicion,
    domicilioFiscal: r.direccion,
    ubigeo: r.ubigeo,
    asOf: r.as_of,
    fuente: "openruc.com (ficha reducida, en vivo)",
    consultadoEn: r.consultado_en,
    nota: "Fallback porque este RUC no está en la ficha SUNAT completa (ficha_ruc) — no incluye actividades CIIU ni representantes legales.",
  };
}

/**
 * Fallback cuando el RUC no está en `ficha_ruc`: usa el caché si está
 * fresco (< 24h), si no pega a openruc.com en vivo y guarda el resultado.
 * Devuelve `null` si ni el caché ni la consulta en vivo tienen el RUC.
 */
async function lookupRucFallback(
  ctx: ToolHandlerContext,
  ruc: string
): Promise<ReturnType<typeof cacheToApiShape> | null> {
  const { db } = ctx;
  const { rows: cached } = await db.query<RucLookupCacheRow>(
    `SELECT ruc, razon_social, estado, condicion, direccion, ubigeo, as_of, consultado_en
     FROM ruc_lookup_cache WHERE ruc = $1`,
    [ruc]
  );
  if (cached.length > 0 && Date.now() - new Date(cached[0].consultado_en).getTime() < CACHE_TTL_MS) {
    return cacheToApiShape(cached[0]);
  }

  const live = await fetchRucLive(ruc);
  if (!live) {
    return cached.length > 0 ? cacheToApiShape(cached[0]) : null;
  }

  const { rows: upserted } = await db.query<RucLookupCacheRow>(
    `INSERT INTO ruc_lookup_cache (ruc, razon_social, estado, condicion, direccion, ubigeo, as_of, consultado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (ruc) DO UPDATE
       SET razon_social = EXCLUDED.razon_social, estado = EXCLUDED.estado, condicion = EXCLUDED.condicion,
           direccion = EXCLUDED.direccion, ubigeo = EXCLUDED.ubigeo, as_of = EXCLUDED.as_of,
           consultado_en = EXCLUDED.consultado_en
     RETURNING ruc, razon_social, estado, condicion, direccion, ubigeo, as_of, consultado_en`,
    [live.ruc, live.razonSocial, live.estado, live.condicion, live.direccion, live.ubigeo, live.asOf]
  );
  return cacheToApiShape(upserted[0]);
}

interface FichaRucRow extends NeonRow {
  ruc: string;
  razon_social: string;
  nombre_comercial: string;
  tipo_contribuyente: string;
  estado_contribuyente: string;
  condicion_contribuyente: string;
  domicilio_fiscal: string;
  actividad_comercio_exterior: string;
  fecha_consulta: string;
}

interface CountRow extends NeonRow {
  total: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Handler para `identidad_fiscal_ficha_ruc` — GET /api/ficha-ruc
 *
 * SQL idéntico a `apps/identidad-fiscal/api/src/routes/ficha-ruc.ts`.
 * Ver docs/adr/0024-neon-en-lugar-de-d1.md.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;

  const limit = Math.min(args.limit ? Number(args.limit) : DEFAULT_LIMIT, MAX_LIMIT);
  const offset = args.offset ? Number(args.offset) : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  const razonSocial = args.razonSocial as string | undefined;
  const cultivo = args.cultivo as string | undefined;
  const exportador = args.exportador as boolean | undefined;

  if (razonSocial) {
    params.push(`%${razonSocial.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (cultivo) {
    params.push(`%${cultivo.toUpperCase()}%`);
    conditions.push(`razon_social ILIKE $${params.length}`);
  }
  if (exportador !== undefined) {
    params.push(exportador ? "EXPORTADOR" : null);
    conditions.push(
      exportador
        ? `actividad_comercio_exterior = $${params.length}`
        : `actividad_comercio_exterior IS DISTINCT FROM 'EXPORTADOR'`
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await db.query<CountRow>(
    `SELECT COUNT(*) AS total FROM ficha_ruc ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const dataResult = await db.query<FichaRucRow>(
    `SELECT ruc, razon_social, nombre_comercial, tipo_contribuyente, estado_contribuyente,
            condicion_contribuyente, domicilio_fiscal, actividad_comercio_exterior, fecha_consulta
     FROM ficha_ruc
     ${where}
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
        nombreComercial: r.nombre_comercial,
        tipoContribuyente: r.tipo_contribuyente,
        estadoContribuyente: r.estado_contribuyente,
        condicionContribuyente: r.condicion_contribuyente,
        domicilioFiscal: r.domicilio_fiscal,
        actividadComercioExterior: r.actividad_comercio_exterior,
        fechaConsulta: r.fecha_consulta,
      })),
    },
  };
}

/**
 * Handler para `identidad_fiscal_ficha_ruc_by_ruc` — GET /api/ficha-ruc/{ruc}
 */
export async function byRuc(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const ruc = args.ruc as string;

  const { rows } = await db.query<FichaRucRow>(`SELECT * FROM ficha_ruc WHERE ruc = $1`, [ruc]);
  if (rows.length === 0) {
    const fallback = await lookupRucFallback(ctx, ruc);
    if (!fallback) {
      return {
        status: 404,
        body: { error: "RUC no encontrado en las fichas SUNAT ya consultadas ni en openruc.com." },
      };
    }
    return { status: 200, body: fallback };
  }
  const r = rows[0];

  const { rows: actividades } = await db.query<NeonRow>(
    `SELECT orden, tipo, codigo_ciiu, descripcion FROM ficha_ruc_actividades WHERE ruc = $1 ORDER BY orden`,
    [ruc]
  );
  const { rows: representantes } = await db.query<NeonRow>(
    `SELECT tipo_documento, numero_documento, nombre, cargo, fecha_desde
     FROM ficha_ruc_representantes WHERE ruc = $1 ORDER BY fecha_desde DESC NULLS LAST`,
    [ruc]
  );

  return {
    status: 200,
    body: {
      ruc: r.ruc,
      razonSocial: r.razon_social,
      nombreComercial: r.nombre_comercial,
      tipoContribuyente: r.tipo_contribuyente,
      fechaInscripcion: r.fecha_inscripcion,
      fechaInicioActividades: r.fecha_inicio_actividades,
      estadoContribuyente: r.estado_contribuyente,
      condicionContribuyente: r.condicion_contribuyente,
      domicilioFiscal: r.domicilio_fiscal,
      sistemaEmisionComprobante: r.sistema_emision_comprobante,
      actividadComercioExterior: r.actividad_comercio_exterior,
      sistemaContabilidad: r.sistema_contabilidad,
      comprobantesPago: r.comprobantes_pago,
      sistemaEmisionElectronica: r.sistema_emision_electronica,
      emisorElectronicoDesde: r.emisor_electronico_desde,
      comprobantesElectronicos: r.comprobantes_electronicos,
      afiliadoPleDesde: r.afiliado_ple_desde,
      padrones: r.padrones,
      fechaConsulta: r.fecha_consulta,
      fuente: "ficha_ruc (SUNAT, importada manualmente)",
      actividades: actividades.map((a) => ({
        orden: a.orden,
        tipo: a.tipo,
        codigoCiiu: a.codigo_ciiu,
        descripcion: a.descripcion,
      })),
      representantesLegales: representantes.map((rep) => ({
        tipoDocumento: rep.tipo_documento,
        numeroDocumento: rep.numero_documento,
        nombre: rep.nombre,
        cargo: rep.cargo,
        fechaDesde: rep.fecha_desde,
      })),
    },
  };
}