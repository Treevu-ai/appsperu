import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { fetchRucLive } from "../lib/openruc-client.js";

export const fichaRucRouter = Router();

/** Caché del fallback en vivo: no re-consultar openruc.com antes de este tiempo. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RucLookupCacheRow {
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
async function lookupRucFallback(ruc: string): Promise<ReturnType<typeof cacheToApiShape> | null> {
  const { rows: cached } = await pool.query<RucLookupCacheRow>(
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

  const { rows: upserted } = await pool.query<RucLookupCacheRow>(
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

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const SearchQuerySchema = z.object({
  razonSocial: z.string().min(1).optional(),
  cultivo: z.string().min(1).optional(),
  exportador: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * `cultivo` sigue siendo texto libre sobre `razon_social` (ILIKE) — SUNAT
 * tampoco clasifica por tipo de cultivo, igual que PRODUCE. `exportador`
 * filtra por el campo real `actividad_comercio_exterior = 'EXPORTADOR'`.
 */
fichaRucRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(SearchQuerySchema, req.query, res);
  if (!parsed) return;
  const { razonSocial, cultivo, exportador, limit, offset } = parsed;

  const conditions: string[] = [];
  const params: unknown[] = [];

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
    conditions.push(exportador ? `actividad_comercio_exterior = $${params.length}` : `actividad_comercio_exterior IS DISTINCT FROM 'EXPORTADOR'`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM ficha_ruc ${where}`,
    params
  );
  const total = Number(countRows[0].total);

  const { rows } = await pool.query(
    `SELECT ruc, razon_social, nombre_comercial, tipo_contribuyente, estado_contribuyente,
            condicion_contribuyente, domicilio_fiscal, actividad_comercio_exterior, fecha_consulta
     FROM ficha_ruc
     ${where}
     ORDER BY razon_social
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({
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
  });
}));

const RUC_REGEX = /^\d{11}$/;

fichaRucRouter.get("/:ruc", asyncHandler(async (req, res) => {
  // Valida el formato ANTES de disparar el fallback en vivo a openruc.com —
  // sin esto, cualquier string mal formado o arbitrariamente largo que no
  // esté en ficha_ruc dispara igual una consulta saliente a un tercero.
  if (!RUC_REGEX.test(req.params.ruc)) {
    res.status(400).json({ error: "ruc debe tener 11 dígitos." });
    return;
  }

  const { rows } = await pool.query(`SELECT * FROM ficha_ruc WHERE ruc = $1`, [req.params.ruc]);
  if (rows.length === 0) {
    const fallback = await lookupRucFallback(req.params.ruc);
    if (!fallback) {
      res.status(404).json({ error: "RUC no encontrado en las fichas SUNAT ya consultadas ni en openruc.com." });
      return;
    }
    res.json(fallback);
    return;
  }
  const r = rows[0];

  const { rows: actividades } = await pool.query(
    `SELECT orden, tipo, codigo_ciiu, descripcion FROM ficha_ruc_actividades WHERE ruc = $1 ORDER BY orden`,
    [req.params.ruc]
  );
  const { rows: representantes } = await pool.query(
    `SELECT tipo_documento, numero_documento, nombre, cargo, fecha_desde
     FROM ficha_ruc_representantes WHERE ruc = $1 ORDER BY fecha_desde DESC NULLS LAST`,
    [req.params.ruc]
  );

  res.json({
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
  });
}));
