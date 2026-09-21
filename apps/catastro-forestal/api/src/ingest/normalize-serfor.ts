/**
 * Normaliza features de 10 capas de dos servicios ArcGIS REST de SERFOR (Modalidad_Acceso y
 * Ordenamiento_Forestal). Cada capa trae un juego de campos propio -- los campos comunes
 * (fuente/registro/ubicación/superficie/fechas/estado) se normalizan a columnas propias; el resto
 * se guarda en `atributosExtra` sin perderlo (mismo criterio que `areas-protegidas`/SERNANP,
 * incluido el hallazgo real de Copilot de esa app: `extra` debe cubrir TODOS los campos no
 * comunes de cada capa, no solo los que parecían relevantes a simple vista).
 *
 * Hallazgo real (ADS-01/ADS-02, 2026-09-22): pese al nombre "NOM" (de "nombre"), `NOMDEP` **es
 * siempre un código UBIGEO numérico como texto** (ej. `"22"` = San Martín) en las 10 capas,
 * verificado en vivo. `NOMPRO`/`NOMDIS` también son códigos UBIGEO en 9 de las 10 capas -- pero
 * en `modalidad_autorizacion_cambio_uso_agropecuario` son **nombres reales** ("Puerto Inca",
 * "Honoria"), no códigos. Es una inconsistencia real de la fuente entre capas, no un error de
 * este conector -- se guardan tal cual vienen, sin normalizar a un formato común ni decodificar.
 * Un consumidor que necesite el nombre real de depto/provincia/distrito para las demás 9 capas
 * debe cruzar `NOMDEP`/`NOMPRO`/`NOMDIS` contra una tabla UBIGEO aparte.
 */

export type Capa =
  | "modalidad_permisos"
  | "modalidad_cesiones_en_uso"
  | "modalidad_autorizaciones_pfdm_avnb"
  | "modalidad_autorizacion_cambio_uso_agropecuario"
  | "modalidad_bosques_locales"
  | "modalidad_unidad_aprovechamiento"
  | "modalidad_concesiones_forestales"
  | "ordenamiento_bosques_locales"
  | "ordenamiento_bosques_protectores"
  | "ordenamiento_bosques_produccion_permanente";

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

interface EsriFeature {
  attributes: Record<string, unknown>;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

function toDouble(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function epochMsToDateOnly(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export interface CanonicalTitulo {
  capa: Capa;
  objectid: number;
  fuente: string | null;
  docReg: string | null;
  fecReg: string | null;
  observ: string | null;
  zonUtm: number | null;
  origen: number | null;
  nomDis: string | null;
  nomPro: string | null;
  nomDep: string | null;
  autFor: number | null;
  fecIni: string | null;
  fecTer: string | null;
  situac: number | null;
  supSig: number | null;
  supApr: number | null;
  docLeg: string | null;
  fecLeg: string | null;
  atributosExtra: Record<string, unknown> | null;
}

/** Campos que cada capa envía además de los comunes -- confirmados contra el schema real de cada una. */
const EXTRA_FIELDS: Record<Capa, string[]> = {
  modalidad_permisos: [
    "TIPPER", "NUMPER", "ASIGNA", "NOMCCN", "CODCAT", "SECTOR", "VOLAPR", "NIVAPR", "DOCGES",
    "TIPGES", "RESOSI", "RESAUT", "ESTCON", "FECCON", "ESTOSI", "FECOSI", "DOCTIT", "NROPAR",
    "ESPECI", "ANOTOR", "NOMUMF",
  ],
  modalidad_cesiones_en_uso: [
    "TIPCEU", "CONTRA", "FECONT", "ANOTOR", "NUMREG", "DESCCP", "NOMBUG", "RESOSI", "RESAUT",
    "ESTCON", "FECCON", "ESTOSI", "FECOSI", "NUMDIV",
  ],
  modalidad_autorizaciones_pfdm_avnb: [
    "TIPANB", "NUMAUT", "ASIGNA", "NOMCCN", "CODCAT", "SECTOR", "DOCTIT", "NROPAR", "CANAPR",
    "UNIMED", "RESOSI", "RESAUT", "ESTCON", "FECCON", "ESTOSI", "FECOSI", "ESPECI", "TIPGES",
    "ANOTOR", "NOMUMF",
  ],
  modalidad_autorizacion_cambio_uso_agropecuario: [
    "TIPAUT", "NUMAUT", "DOCTIT", "CODCAT", "SECTOR", "SUPSOL", "SUPTOT", "SUPTIT", "PAGO",
    "VOLAPR", "SUPRES", "DESTIN",
  ],
  modalidad_bosques_locales: [
    "CODIGO", "NOMBOS", "TIPBLO", "NOMTIT", "NOMREL", "TIPDOC", "VOLAPR", "NIVAPR", "CUENCA",
    "SECTOR", "RESOSI", "RESAUT", "ESTCON", "FECCON", "ESTOSI", "FECOSI", "ANOTOR",
  ],
  modalidad_unidad_aprovechamiento: ["LOTE", "CONTRA", "CONCUR", "MODOTO", "FECOTO", "ESTUA", "FECEUA"],
  modalidad_concesiones_forestales: [
    "TIPCON", "CONTRA", "FECONT", "ADENDA", "NUMREG", "ESPECI", "CONCUR", "PROCOT", "PERIME",
    "VOLAPR", "CUENCA", "SECTOR", "PRODUC", "CERFOR", "FINALI", "RESOSI", "RESAUT", "ESTMOD",
    "FECMOD", "SUPSUS", "RESSUS", "ESTCON", "FECCON", "ESTOSI", "FECOSI", "ESTADE", "OBJCON",
    "ADEREF", "NROTUR", "PAGODA", "TIPAGO", "NROPAR", "ANOTOR",
  ],
  ordenamiento_bosques_locales: ["NOMBOS", "CATORD", "DOCSOL", "FECSOL", "FECPUB"],
  ordenamiento_bosques_protectores: ["NOMBOS", "DOCRED", "FECRED", "CATRED", "FECPUB"],
  ordenamiento_bosques_produccion_permanente: [
    "ZONA", "DOCRED", "FECRED", "CATRED", "CATBOS", "NROPAR", "FECPUB", "FECINS",
  ],
};

export interface NormalizeTitulosResult {
  rows: CanonicalTitulo[];
  rejected: RejectedRow[];
}

export function normalizeTitulos(features: readonly EsriFeature[], capa: Capa): NormalizeTitulosResult {
  const rows: CanonicalTitulo[] = [];
  const rejected: RejectedRow[] = [];
  const extraFields = EXTRA_FIELDS[capa];

  for (const feature of features) {
    const attrs = feature.attributes ?? {};
    const objectid = toInt(attrs.OBJECTID ?? attrs.objectid);

    if (objectid === null) {
      rejected.push({ raw: feature, reason: "OBJECTID ausente o inválido" });
      continue;
    }

    const atributosExtra: Record<string, unknown> = {};
    for (const key of extraFields) {
      if (attrs[key] !== undefined) atributosExtra[key] = attrs[key];
    }

    rows.push({
      capa,
      objectid,
      fuente: toText(attrs.FUENTE),
      docReg: toText(attrs.DOCREG),
      fecReg: epochMsToDateOnly(attrs.FECREG),
      observ: toText(attrs.OBSERV),
      zonUtm: toInt(attrs.ZONUTM),
      origen: toInt(attrs.ORIGEN),
      nomDis: toText(attrs.NOMDIS),
      nomPro: toText(attrs.NOMPRO),
      nomDep: toText(attrs.NOMDEP),
      autFor: toInt(attrs.AUTFOR),
      fecIni: epochMsToDateOnly(attrs.FECINI),
      fecTer: epochMsToDateOnly(attrs.FECTER),
      situac: toInt(attrs.SITUAC),
      supSig: toDouble(attrs.SUPSIG),
      supApr: toDouble(attrs.SUPAPR),
      docLeg: toText(attrs.DOCLEG),
      fecLeg: epochMsToDateOnly(attrs.FECLEG),
      atributosExtra: Object.keys(atributosExtra).length > 0 ? atributosExtra : null,
    });
  }

  return { rows, rejected };
}
