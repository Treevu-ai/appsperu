import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const DATOS_INICIALES_URL = "https://cej.jne.gob.pe/Autoridades/getDatosIniciales";
const LISTAR_URL = "https://cej.jne.gob.pe/Autoridades/ListarConformacionActual";

// Confirmado en vivo 2026-09-22: sin estos IDs documentados en la API pública, se extrajeron
// de los bundles JS servidos por el propio sitio (Content/files/main-js, core-js), donde
// $CONS.GLOBAL define IDTIPOELECCION_MUND__=6, IDTIPOELECCION_MUNP__=5, IDTIPOELECCION_REGI__=4.
// Esta versión solo ingiere Distrital y Provincial (el gap que bloqueó el caso Sarín); Regional
// queda fuera a propósito, ver nota de alcance en la migración 002.
const ID_TIPO_ELECCION_DISTRITAL = 6;
const ID_TIPO_ELECCION_PROVINCIAL = 5;

const RATE_LIMIT_DELAY_MS = 250;

interface UbigeoRow {
  strUbigeo: string;
  strUbiDepartamento: string;
  strUbiProvincia: string;
  strUbiDistrito: string;
  strDepartamento: string;
  strProvincia: string;
  strDistrito: string;
}

interface DatosInicialesResponse {
  data: { lUbigeo: UbigeoRow[] };
}

interface ConformacionRow {
  strDocumentoIdentidad: string | null;
  strNombres: string;
  strApellidoPaterno: string;
  strApellidoMaterno: string | null;
  strOrganizacionPolitica: string | null;
  strCargo: string;
  idCargo: number | null;
  intPosicion: number | null;
  strDepartamento: string;
  strProvincia: string;
  strDistrito: string;
  idProcesoElectoral: number | null;
  strProcesoElectoral: string | null;
  idPeriodoGob: number | null;
  strFechaFinVigencia: string | null;
  strRutaFoto: string | null;
  strRutaPlanGob: string | null;
  idHojaVida: number | null;
  idConformacionDetalle: number;
}

interface ListarConformacionResponse {
  success: boolean;
  data: { lbeConformacion: ConformacionRow[] };
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function hashDni(dni: string | null): string | null {
  if (!dni) return null;
  return createHash("sha256").update(dni.trim()).digest("hex");
}

// Formato fuente: "31/12/2026 00:00:00" -> "2026-12-31". Sin librería de fechas: mismo patrón
// simple ya usado en otros conectores del proyecto (ej. sbn-supervision-connector.ts).
function parseFechaFin(value: string | null): string | null {
  if (!value) return null;
  const [datePart] = value.split(" ");
  const [dd, mm, yyyy] = datePart.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`JNE devolvió ${res.status} al consultar ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchUbigeosDomesticos(): Promise<UbigeoRow[]> {
  const body = await fetchJson<DatosInicialesResponse>(DATOS_INICIALES_URL);
  // Departamentos 91-95 son circunscripciones de voto en el extranjero (ej. "91"=África) —
  // se excluyen porque no tienen municipalidad distrital/provincial real que ingerir.
  return body.data.lUbigeo.filter((u) => Number(u.strUbiDepartamento) <= 25);
}

export function soloDistritos(ubigeos: readonly UbigeoRow[]): UbigeoRow[] {
  return ubigeos.filter((u) => u.strUbiDistrito !== "00");
}

export function soloProvincias(ubigeos: readonly UbigeoRow[]): UbigeoRow[] {
  return ubigeos.filter((u) => u.strUbiDistrito === "00" && u.strUbiProvincia !== "00");
}

export interface CanonicalAutoridadVigente {
  dniHash: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  organizacionPolitica: string | null;
  cargo: string;
  idCargo: number | null;
  posicion: number | null;
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  idTipoEleccion: number;
  tipoEleccion: string;
  idProcesoElectoral: number | null;
  procesoElectoral: string | null;
  idPeriodoGobierno: number | null;
  fechaFinVigencia: string | null;
  rutaFoto: string | null;
  rutaPlanGobierno: string | null;
  idHojaVida: number | null;
  idConformacionDetalle: number;
}

export function normalizeConformacion(
  rows: readonly ConformacionRow[],
  ubigeo: string,
  idTipoEleccion: number,
  tipoEleccion: string
): CanonicalAutoridadVigente[] {
  return rows.map((r) => ({
    dniHash: hashDni(r.strDocumentoIdentidad),
    nombres: r.strNombres.trim(),
    apellidoPaterno: r.strApellidoPaterno.trim(),
    apellidoMaterno: r.strApellidoMaterno?.trim() || null,
    organizacionPolitica: r.strOrganizacionPolitica?.trim() || null,
    cargo: r.strCargo.trim(),
    idCargo: r.idCargo,
    posicion: r.intPosicion,
    departamento: r.strDepartamento.trim(),
    provincia: r.strProvincia.trim(),
    distrito: r.strDistrito.trim(),
    ubigeo,
    idTipoEleccion,
    tipoEleccion,
    idProcesoElectoral: r.idProcesoElectoral,
    procesoElectoral: r.strProcesoElectoral,
    idPeriodoGobierno: r.idPeriodoGob,
    fechaFinVigencia: parseFechaFin(r.strFechaFinVigencia),
    rutaFoto: r.strRutaFoto,
    rutaPlanGobierno: r.strRutaPlanGob,
    idHojaVida: r.idHojaVida,
    idConformacionDetalle: r.idConformacionDetalle,
  }));
}

async function saveRawBatch(
  client: PoolClient,
  ubigeo: string,
  idTipoEleccion: number,
  checksum: string,
  recordCount: number
): Promise<number> {
  const existing = await client.query<{ id: number }>(
    `SELECT id FROM raw_autoridades_vigentes_batches WHERE ubigeo = $1 AND id_tipo_eleccion = $2 AND checksum = $3`,
    [ubigeo, idTipoEleccion, checksum]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO raw_autoridades_vigentes_batches (ubigeo, id_tipo_eleccion, checksum, record_count)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [ubigeo, idTipoEleccion, checksum, recordCount]
  );
  return inserted.rows[0].id;
}

async function persistRows(client: PoolClient, rows: readonly CanonicalAutoridadVigente[], batchId: number): Promise<void> {
  for (const r of rows) {
    await client.query(
      `INSERT INTO autoridades_vigentes (
         dni_hash, nombres, apellido_paterno, apellido_materno, organizacion_politica, cargo,
         id_cargo, posicion, departamento, provincia, distrito, ubigeo, id_tipo_eleccion,
         tipo_eleccion, id_proceso_electoral, proceso_electoral, id_periodo_gobierno,
         fecha_fin_vigencia, ruta_foto, ruta_plan_gobierno, id_hoja_vida, id_conformacion_detalle,
         source_batch_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id_conformacion_detalle) DO UPDATE SET
         dni_hash = EXCLUDED.dni_hash,
         nombres = EXCLUDED.nombres,
         apellido_paterno = EXCLUDED.apellido_paterno,
         apellido_materno = EXCLUDED.apellido_materno,
         organizacion_politica = EXCLUDED.organizacion_politica,
         cargo = EXCLUDED.cargo,
         id_cargo = EXCLUDED.id_cargo,
         posicion = EXCLUDED.posicion,
         departamento = EXCLUDED.departamento,
         provincia = EXCLUDED.provincia,
         distrito = EXCLUDED.distrito,
         ubigeo = EXCLUDED.ubigeo,
         id_tipo_eleccion = EXCLUDED.id_tipo_eleccion,
         tipo_eleccion = EXCLUDED.tipo_eleccion,
         id_proceso_electoral = EXCLUDED.id_proceso_electoral,
         proceso_electoral = EXCLUDED.proceso_electoral,
         id_periodo_gobierno = EXCLUDED.id_periodo_gobierno,
         fecha_fin_vigencia = EXCLUDED.fecha_fin_vigencia,
         ruta_foto = EXCLUDED.ruta_foto,
         ruta_plan_gobierno = EXCLUDED.ruta_plan_gobierno,
         id_hoja_vida = EXCLUDED.id_hoja_vida,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        r.dniHash,
        r.nombres,
        r.apellidoPaterno,
        r.apellidoMaterno,
        r.organizacionPolitica,
        r.cargo,
        r.idCargo,
        r.posicion,
        r.departamento,
        r.provincia,
        r.distrito,
        r.ubigeo,
        r.idTipoEleccion,
        r.tipoEleccion,
        r.idProcesoElectoral,
        r.procesoElectoral,
        r.idPeriodoGobierno,
        r.fechaFinVigencia,
        r.rutaFoto,
        r.rutaPlanGobierno,
        r.idHojaVida,
        r.idConformacionDetalle,
        batchId,
      ]
    );
  }
}

export interface AutoridadesVigentesIngestSummary {
  ubigeosConsultados: number;
  filasInsertadas: number;
  ubigeosSinAutoridad: number;
  errores: number;
}

async function ingestUbigeo(
  ubigeo: UbigeoRow,
  idTipoEleccion: number,
  tipoEleccion: string
): Promise<{ inserted: number; hadData: boolean }> {
  const body = JSON.stringify({ idTipoEleccion, strUbigeo: ubigeo.strUbigeo });
  const response = await fetchJson<ListarConformacionResponse>(LISTAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body,
  });

  if (!response.success || response.data.lbeConformacion.length === 0) {
    return { inserted: 0, hadData: false };
  }

  const rows = normalizeConformacion(response.data.lbeConformacion, ubigeo.strUbigeo, idTipoEleccion, tipoEleccion);
  const checksum = checksumOf(JSON.stringify(response.data.lbeConformacion));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, ubigeo.strUbigeo, idTipoEleccion, checksum, rows.length);
    await persistRows(client, rows, batchId);
    await client.query("COMMIT");
    return { inserted: rows.length, hadData: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestAutoridadesVigentes(): Promise<AutoridadesVigentesIngestSummary> {
  const ubigeos = await fetchUbigeosDomesticos();
  const distritos = soloDistritos(ubigeos);
  const provincias = soloProvincias(ubigeos);

  const objetivos: Array<{ ubigeo: UbigeoRow; idTipoEleccion: number; tipoEleccion: string }> = [
    ...distritos.map((u) => ({ ubigeo: u, idTipoEleccion: ID_TIPO_ELECCION_DISTRITAL, tipoEleccion: "MUNICIPALIDAD DISTRITAL" })),
    ...provincias.map((u) => ({ ubigeo: u, idTipoEleccion: ID_TIPO_ELECCION_PROVINCIAL, tipoEleccion: "MUNICIPALIDAD PROVINCIAL" })),
  ];

  let filasInsertadas = 0;
  let ubigeosSinAutoridad = 0;
  let errores = 0;

  for (const objetivo of objetivos) {
    try {
      const { inserted, hadData } = await ingestUbigeo(objetivo.ubigeo, objetivo.idTipoEleccion, objetivo.tipoEleccion);
      filasInsertadas += inserted;
      if (!hadData) ubigeosSinAutoridad += 1;
    } catch (error) {
      errores += 1;
      console.error(
        `Error consultando ${objetivo.tipoEleccion} ubigeo ${objetivo.ubigeo.strUbigeo} (${objetivo.ubigeo.strDistrito || objetivo.ubigeo.strProvincia}):`,
        error instanceof Error ? error.message : error
      );
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return { ubigeosConsultados: objetivos.length, filasInsertadas, ubigeosSinAutoridad, errores };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestAutoridadesVigentes()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
