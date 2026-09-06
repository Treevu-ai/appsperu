/**
 * Normaliza filas del Padrón Web de Instituciones y Programas Educativos (ESCALE/MINEDU).
 *
 * Deliberadamente NO lee `DIRECTOR`, `TELEFONO`, `EMAIL` ni `PROMOTOR` del objeto crudo — ver
 * el comentario de alcance en `db/migrations/001_init.sql`. Aunque el DBF fuente los trae, este
 * normalizador nunca los toca, mismo patrón que `informes-control-connector.ts`.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

/**
 * El DBF fuente rellena campos de texto de ancho fijo con bytes NUL (`\0`) en vez de espacios
 * en algunas filas — confirmado en vivo 2026-09-06: Postgres rechaza `invalid byte sequence for
 * encoding "UTF8": 0x00` a mitad de una ingesta real (fila ~120,000 de 180,828). Se limpian
 * antes de persistir, no solo se recorta con `trim()`.
 */
function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\0/g, "").trim();
  return s === "" ? null : s;
}

function toFloat(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Fechas reales confirmadas en formato `DD-MM-AAAA` (texto), no fecha nativa del DBF. */
function toDateOnly(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export interface CanonicalInstitucion {
  codMod: string;
  anexo: string;
  codLocal: string | null;
  codInst: string | null;
  nombre: string;
  nivelModalidad: string | null;
  forma: string | null;
  tipoSexo: string | null;
  gestion: string | null;
  gestionDependencia: string | null;
  direccion: string | null;
  localidad: string | null;
  codCcpp: string | null;
  centroPoblado: string | null;
  areaCenso: string | null;
  ubigeo: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  dre: string | null;
  codUgel: string | null;
  ugel: string | null;
  latitud: number | null;
  longitud: number | null;
  tipoPrograma: string | null;
  turno: string | null;
  ruc: string | null;
  razonSocial: string | null;
  estado: string | null;
  fechaActualizacion: string | null;
}

export interface NormalizeInstitucionesResult {
  rows: CanonicalInstitucion[];
  rejected: RejectedRow[];
}

export function normalizeInstituciones(rawRows: Record<string, unknown>[]): NormalizeInstitucionesResult {
  const rows: CanonicalInstitucion[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const codMod = toText(raw["COD_MOD"]);
    const anexo = toText(raw["ANEXO"]);
    const nombre = toText(raw["CEN_EDU"]);
    const departamento = toText(raw["D_DPTO"]);
    const provincia = toText(raw["D_PROV"]);
    const distrito = toText(raw["D_DIST"]);

    if (!codMod) {
      rejected.push({ raw, reason: "COD_MOD ausente" });
      continue;
    }
    if (!anexo) {
      rejected.push({ raw, reason: "ANEXO ausente" });
      continue;
    }
    if (!nombre) {
      rejected.push({ raw, reason: "CEN_EDU (nombre) ausente" });
      continue;
    }
    if (!departamento || !provincia || !distrito) {
      rejected.push({ raw, reason: "D_DPTO/D_PROV/D_DIST ausente" });
      continue;
    }

    const ubigeoRaw = toText(raw["CODGEO"]);
    const ubigeo = ubigeoRaw && /^\d{6}$/.test(ubigeoRaw) ? ubigeoRaw : null;

    rows.push({
      codMod,
      anexo,
      codLocal: toText(raw["CODLOCAL"]),
      codInst: toText(raw["CODINST"]),
      nombre,
      nivelModalidad: toText(raw["D_NIV_MOD"]),
      forma: toText(raw["D_FORMA"]),
      tipoSexo: toText(raw["D_TIPSSEXO"]),
      gestion: toText(raw["D_GESTION"]),
      gestionDependencia: toText(raw["D_GES_DEP"]),
      direccion: toText(raw["DIR_CEN"]),
      localidad: toText(raw["LOCALIDAD"]),
      codCcpp: toText(raw["CODCCPP"]),
      centroPoblado: toText(raw["CEN_POB"]),
      areaCenso: toText(raw["DAREACENSO"]),
      ubigeo,
      departamento,
      provincia,
      distrito,
      dre: toText(raw["D_REGION"]),
      codUgel: toText(raw["CODOOII"]),
      ugel: toText(raw["D_DREUGEL"]),
      latitud: toFloat(raw["NLAT_IE"]),
      longitud: toFloat(raw["NLONG_IE"]),
      tipoPrograma: toText(raw["D_TIPOPROG"]),
      turno: toText(raw["D_COD_TUR"]),
      ruc: toText(raw["NRORUC"]),
      razonSocial: toText(raw["RZSOCIAL"]),
      estado: toText(raw["D_ESTADO"]),
      fechaActualizacion: toDateOnly(raw["FECHA_ACT"]),
    });
  }

  return { rows, rejected };
}
