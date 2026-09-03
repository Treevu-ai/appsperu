import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

/**
 * Conformación societaria de proveedores del Estado — Buscador de Proveedores
 * (OSCE), vía la API JSON que consume su SPA Angular en
 * apps.osce.gob.pe/perfilprov-ui. No es un endpoint documentado públicamente:
 * se descubrió inspeccionando el bundle JS de la SPA (urlServiceParent /
 * urlServiceFup en el `environment` embebido) y se verificó en vivo el
 * 2026-09-03 contra RUCs reales. Se conserva el payload crudo completo por
 * RUC para poder reproducir la consulta y detectar cambios de esquema.
 *
 * Dos llamadas por RUC:
 *   1. Búsqueda por texto (para resolver `codProv` — en la práctica coincide
 *      con el RUC para la mayoría de personas jurídicas, pero no se asume:
 *      siempre se resuelve por búsqueda primero).
 *   2. Ficha `/resumen`, que trae datosSunat + conformacion (socios,
 *      representantes, órganos de administración) en una sola respuesta.
 *
 * Limitación conocida y verificada con 3 consorcios de muestra: el campo
 * `socios` viene vacío para proveedores tipo "CONTRATOS COLABORACION
 * EMPRESARIAL" (consorcios) — no tienen accionistas en el sentido societario
 * que expone este endpoint. Funciona para personas jurídicas regulares
 * (S.A.C., S.R.L., E.I.R.L., etc.).
 */

const SEARCH_URL = "https://eap.oece.gob.pe/perfilprov-bus/1.0/tarjetas";
const FICHA_URL = "https://eap.oece.gob.pe/ficha-proveedor-cns/1.0/ficha";
const SOURCE_SYSTEM = "osce-perfilprov-ui-v1";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface TarjetaProveedor {
  codProv: string;
  numRuc: string | null;
  nomRzsProv: string;
}

interface Socio {
  nroDocumento: string | null;
  descDocIde: string | null;
  razonSocial: string | null;
  numeroAcciones: number | null;
  porcentajeAcciones: number | null;
  fechaIngreso: string | null;
}

interface Representante {
  nroDocumento: string | null;
  descDocIde: string | null;
  razonSocial: string | null;
  descCargo: string | null;
  fechaIngreso: string | null;
}

interface OrganoAdmin {
  nroDocumento: string | null;
  descDocIde: string | null;
  apellidosNomb: string | null;
  descCargo: string | null;
  fechaIngreso: string | null;
}

interface FichaResumen {
  datosSunat?: { ruc: string; razon: string; tipoEmpresa: string; estado: string; condicion: string };
  conformacion?: {
    proveedor: { numeroRuc: string | null; razonSocial: string | null };
    socios: Socio[];
    representantes: Representante[];
    organosAdm: OrganoAdmin[];
  };
}

function checksumOf(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`OSCE perfilprov devolvió ${res.status} en ${url}`);
  return (await res.json()) as T;
}

async function resolveCodProv(ruc: string): Promise<TarjetaProveedor | null> {
  const url = `${SEARCH_URL}?searchText=${encodeURIComponent(ruc)}&pageSize=5&pageNumber=1`;
  const body = await fetchJson<{ tarjetasProvT01: TarjetaProveedor[] | null }>(url);
  const tarjetas = body.tarjetasProvT01 ?? [];
  return tarjetas.find((t) => t.numRuc === ruc) ?? tarjetas[0] ?? null;
}

function parseFecha(value: string | null | undefined): string | null {
  if (!value) return null;
  const [dd, mm, yyyy] = value.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

async function saveRawBatch(ruc: string, url: string, payload: unknown): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO raw_conformacion_batches (source_system, source_url, ruc, checksum, payload)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [SOURCE_SYSTEM, url, ruc, checksumOf(payload), JSON.stringify(payload)]
  );
  return rows[0].id;
}

export interface ConformacionResult {
  ruc: string;
  found: boolean;
  tieneSocios: boolean;
  sociosInsertados: number;
  representantesInsertados: number;
  organosInsertados: number;
}

export async function ingestConformacionForRuc(ruc: string): Promise<ConformacionResult> {
  const tarjeta = await resolveCodProv(ruc);
  if (!tarjeta) {
    return { ruc, found: false, tieneSocios: false, sociosInsertados: 0, representantesInsertados: 0, organosInsertados: 0 };
  }

  const fichaUrl = `${FICHA_URL}/${tarjeta.codProv}/resumen`;
  const ficha = await fetchJson<FichaResumen>(fichaUrl);
  const batchId = await saveRawBatch(ruc, fichaUrl, ficha);

  const conformacion = ficha.conformacion;
  const socios = conformacion?.socios ?? [];
  const representantes = conformacion?.representantes ?? [];
  const organos = conformacion?.organosAdm ?? [];
  const tieneSocios = socios.length > 0;

  await pool.query(
    `INSERT INTO supplier_conformacion_lookup (ruc, cod_prov, razon_social, tipo_empresa, estado_sunat, condicion_sunat, tiene_socios, source_batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (ruc) DO UPDATE SET cod_prov=EXCLUDED.cod_prov, razon_social=EXCLUDED.razon_social,
       tipo_empresa=EXCLUDED.tipo_empresa, estado_sunat=EXCLUDED.estado_sunat, condicion_sunat=EXCLUDED.condicion_sunat,
       tiene_socios=EXCLUDED.tiene_socios, source_batch_id=EXCLUDED.source_batch_id, fetched_at=now()`,
    [
      ruc,
      tarjeta.codProv,
      ficha.datosSunat?.razon ?? tarjeta.nomRzsProv,
      ficha.datosSunat?.tipoEmpresa ?? null,
      ficha.datosSunat?.estado ?? null,
      ficha.datosSunat?.condicion ?? null,
      tieneSocios,
      batchId,
    ]
  );

  for (const s of socios) {
    if (!s.razonSocial) continue;
    await pool.query(
      `INSERT INTO supplier_conformacion (ruc, cod_prov, rol, nombre, tipo_documento, numero_documento, numero_acciones, porcentaje_acciones, fecha_ingreso, source_batch_id)
       VALUES ($1,$2,'SOCIO',$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (ruc, rol, numero_documento, nombre) DO UPDATE SET
         numero_acciones=EXCLUDED.numero_acciones, porcentaje_acciones=EXCLUDED.porcentaje_acciones,
         fecha_ingreso=EXCLUDED.fecha_ingreso, source_batch_id=EXCLUDED.source_batch_id, fetched_at=now()`,
      [ruc, tarjeta.codProv, s.razonSocial, s.descDocIde, s.nroDocumento, s.numeroAcciones, s.porcentajeAcciones, parseFecha(s.fechaIngreso), batchId]
    );
  }

  for (const r of representantes) {
    if (!r.razonSocial) continue;
    await pool.query(
      `INSERT INTO supplier_conformacion (ruc, cod_prov, rol, nombre, tipo_documento, numero_documento, cargo, fecha_ingreso, source_batch_id)
       VALUES ($1,$2,'REPRESENTANTE',$3,$4,$5,$6,$7,$8)
       ON CONFLICT (ruc, rol, numero_documento, nombre) DO UPDATE SET
         cargo=EXCLUDED.cargo, fecha_ingreso=EXCLUDED.fecha_ingreso, source_batch_id=EXCLUDED.source_batch_id, fetched_at=now()`,
      [ruc, tarjeta.codProv, r.razonSocial, r.descDocIde, r.nroDocumento, r.descCargo, parseFecha(r.fechaIngreso), batchId]
    );
  }

  for (const o of organos) {
    if (!o.apellidosNomb) continue;
    await pool.query(
      `INSERT INTO supplier_conformacion (ruc, cod_prov, rol, nombre, tipo_documento, numero_documento, cargo, fecha_ingreso, source_batch_id)
       VALUES ($1,$2,'ORGANO_ADMINISTRACION',$3,$4,$5,$6,$7,$8)
       ON CONFLICT (ruc, rol, numero_documento, nombre) DO UPDATE SET
         cargo=EXCLUDED.cargo, fecha_ingreso=EXCLUDED.fecha_ingreso, source_batch_id=EXCLUDED.source_batch_id, fetched_at=now()`,
      [ruc, tarjeta.codProv, o.apellidosNomb, o.descDocIde, o.nroDocumento, o.descCargo, parseFecha(o.fechaIngreso), batchId]
    );
  }

  return {
    ruc,
    found: true,
    tieneSocios,
    sociosInsertados: socios.length,
    representantesInsertados: representantes.length,
    organosInsertados: organos.length,
  };
}

export async function ingestConformacionForRucs(rucs: string[]): Promise<ConformacionResult[]> {
  const results: ConformacionResult[] = [];
  for (const ruc of rucs) {
    try {
      results.push(await ingestConformacionForRuc(ruc));
    } catch (error) {
      console.error(`Conformación falló para RUC ${ruc}:`, error instanceof Error ? error.message : error);
      results.push({ ruc, found: false, tieneSocios: false, sociosInsertados: 0, representantesInsertados: 0, organosInsertados: 0 });
    }
    // Cortesía con el servicio público: espaciar requests, no ráfaga.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rucs = process.argv.slice(2);
  if (rucs.length === 0) {
    console.error("Uso: tsx perfilprov-conformacion-connector.ts <RUC1> [RUC2 ...]");
    process.exit(1);
  }
  ingestConformacionForRucs(rucs)
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .finally(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
