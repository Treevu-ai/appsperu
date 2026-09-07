/**
 * Normaliza filas de los tres catálogos puntuales de infraestructura MTC (terminales
 * portuarios, aeródromos, peajes). Los dos CSV (puertos, aeródromos) vienen en Latin-1 (el
 * conector decodifica el buffer, no este módulo); el geojson de peajes viene en UTF-8.
 * Ver docs/data-contracts/mtc-infraestructura-puntual.md.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" || s === "-" ? null : s;
}

function toDecimal(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function toBooleanFromFlag(value: unknown): boolean | null {
  const text = toText(value);
  if (text === null) return null;
  if (text === "1") return true;
  if (text === "0" || text === "-1") return false;
  return null;
}

/** Fuente real: fechas como entero AAAAMMDD (ej. 20251231). */
function toDateFromYYYYMMDD(value: unknown): string | null {
  const text = toText(value);
  if (!text || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// ---------- Terminales portuarios ----------

export interface CanonicalTerminalPortuario {
  codigoPuerto: string;
  idDepartamento: string | null;
  idProvincia: string | null;
  idDistrito: string | null;
  localidad: string | null;
  nombreTerminal: string | null;
  labelTerminal: string | null;
  ambito: string | null;
  tipoTerminal: string | null;
  alcance: string | null;
  uso: string | null;
  trafico: string | null;
  actividad: string | null;
  subactividad: string | null;
  estado: string | null;
  estadoConservacion: string | null;
  titularidad: string | null;
  administrador: string | null;
  esConcesionado: boolean | null;
  latitud: number | null;
  longitud: number | null;
  fechaCorte: string;
}

export interface NormalizeResult<T> {
  rows: T[];
  rejected: RejectedRow[];
}

export function normalizeTerminalesPortuarios(rawRows: Record<string, unknown>[]): NormalizeResult<CanonicalTerminalPortuario> {
  const rows: CanonicalTerminalPortuario[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const codigoPuerto = toText(raw["CODIGO_PUERTO"]);
    const fechaCorte = toDateFromYYYYMMDD(raw["FECHA_CORTE"]);

    if (!codigoPuerto) {
      rejected.push({ raw, reason: "CODIGO_PUERTO ausente" });
      continue;
    }
    if (!fechaCorte) {
      rejected.push({ raw, reason: "FECHA_CORTE ausente o con formato inválido" });
      continue;
    }

    rows.push({
      codigoPuerto,
      idDepartamento: toText(raw["ID_DEPARTAMENTO"]),
      idProvincia: toText(raw["ID_PROVINCIA"]),
      idDistrito: toText(raw["ID_DISTRITO"]),
      localidad: toText(raw["LOCALIDAD"]),
      nombreTerminal: toText(raw["NOMBRE_TERMINAL"]),
      labelTerminal: toText(raw["LABEL_TERMINAL"]),
      ambito: toText(raw["AMBITO"]),
      tipoTerminal: toText(raw["TIPO_TERMINAL"]),
      alcance: toText(raw["ALCANCE"]),
      uso: toText(raw["USO"]),
      trafico: toText(raw["TRAFICO"]),
      actividad: toText(raw["ACTIVIDAD"]),
      subactividad: toText(raw["SUBACTIVIDAD"]),
      estado: toText(raw["ESTADO"]),
      estadoConservacion: toText(raw["ESTADO_CONSERVACION"]),
      titularidad: toText(raw["TITULARIDAD"]),
      administrador: toText(raw["ADMINISTRADOR"]),
      esConcesionado: toBooleanFromFlag(raw["ES_CONCES"]),
      latitud: toDecimal(raw["LATITUD"]),
      longitud: toDecimal(raw["LONGITUD"]),
      fechaCorte,
    });
  }

  return { rows, rejected };
}

// ---------- Aeródromos ----------

export interface CanonicalAerodromo {
  codigoAerodromo: string;
  idDepartamento: string | null;
  idProvincia: string | null;
  idDistrito: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  nombre: string | null;
  label: string | null;
  tipoAerodromo: string | null;
  codigoOaci: string | null;
  escala: string | null;
  estado: string | null;
  administrador: string | null;
  jerarquia: string | null;
  titularidad: string | null;
  latitud: number | null;
  longitud: number | null;
  esConcesionado: boolean | null;
  fechaCorte: string;
}

export function normalizeAerodromos(rawRows: Record<string, unknown>[]): NormalizeResult<CanonicalAerodromo> {
  const rows: CanonicalAerodromo[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    // ID_AERODROMO no se usa como clave: confirmado en vivo que el corte 2025 trae "#¡REF!"
    // (error de fórmula de Excel de la fuente) — CODIGO_AERODROMO es el identificador estable.
    const codigoAerodromo = toText(raw["CODIGO_AERODROMO"]);
    const fechaCorte = toDateFromYYYYMMDD(raw["FECHA_CORTE"]);

    if (!codigoAerodromo) {
      rejected.push({ raw, reason: "CODIGO_AERODROMO ausente" });
      continue;
    }
    if (!fechaCorte) {
      rejected.push({ raw, reason: "FECHA_CORTE ausente o con formato inválido" });
      continue;
    }

    rows.push({
      codigoAerodromo,
      idDepartamento: toText(raw["ID_DEPARTAMENTO"]),
      idProvincia: toText(raw["ID_PROVINCIA"]),
      idDistrito: toText(raw["ID_DISTRITO"]),
      departamento: toText(raw["DEPARTAMENTO"]),
      provincia: toText(raw["PROVINCIA"]),
      distrito: toText(raw["DISTRITO"]),
      nombre: toText(raw["NOMBRE"]),
      label: toText(raw["LABEL"]),
      tipoAerodromo: toText(raw["TIPO_AERODROMO"]),
      codigoOaci: toText(raw["CODIGO_OACI"]),
      escala: toText(raw["ESCALA"]),
      estado: toText(raw["ESTADO"]),
      administrador: toText(raw["ADMINISTRADOR"]),
      jerarquia: toText(raw["JERARQUIA"]),
      titularidad: toText(raw["TITULARIDAD"]),
      latitud: toDecimal(raw["LATITUD"]),
      longitud: toDecimal(raw["LONGITUD"]),
      esConcesionado: toBooleanFromFlag(raw["ES_CONCES"]),
      fechaCorte,
    });
  }

  return { rows, rejected };
}

// ---------- Peajes (GeoJSON) ----------

export interface CanonicalPeaje {
  codigoPeaje: string;
  nombre: string | null;
  label: string | null;
  codigoRuta: string | null;
  inicioKm: number | null;
  codigoClog: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  localidad: string | null;
  idDepartamento: string | null;
  idProvincia: string | null;
  idDistrito: string | null;
  esConcesionado: boolean | null;
  titular: string | null;
  ubicacion: string | null;
  estado: string | null;
  administrador: string | null;
  latitud: number | null;
  longitud: number | null;
  fechaCorte: string;
}

export interface PeajeFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry?: { type: string; coordinates: [number, number] } | null;
}

export function normalizePeajes(features: PeajeFeature[]): NormalizeResult<CanonicalPeaje> {
  const rows: CanonicalPeaje[] = [];
  const rejected: RejectedRow[] = [];

  for (const feature of features) {
    const props = feature.properties ?? {};
    const codigoPeaje = toText(props["CODPEAJE"]);
    const fechaCorte = toDateFromYYYYMMDD(props["FECCORTE"]);

    if (!codigoPeaje) {
      rejected.push({ raw: feature, reason: "CODPEAJE ausente" });
      continue;
    }
    if (!fechaCorte) {
      rejected.push({ raw: feature, reason: "FECCORTE ausente o con formato inválido" });
      continue;
    }

    const coordinates = feature.geometry?.coordinates;
    const longitud = Array.isArray(coordinates) ? toDecimal(coordinates[0]) : null;
    const latitud = Array.isArray(coordinates) ? toDecimal(coordinates[1]) : null;

    rows.push({
      codigoPeaje,
      nombre: toText(props["NOMBRE"]),
      label: toText(props["LABEL"]),
      codigoRuta: toText(props["CODRUTA"]),
      inicioKm: toDecimal(props["INICIO"]),
      codigoClog: toText(props["CODCLOG"]),
      departamento: toText(props["DEPARTAMEN"]),
      provincia: toText(props["PROVINCIA"]),
      distrito: toText(props["DISTRITO"]),
      localidad: toText(props["LOCALIDAD"]),
      idDepartamento: toText(props["IDDPTO"]),
      idProvincia: toText(props["IDPROV"]),
      idDistrito: toText(props["IDDIST"]),
      esConcesionado: toBooleanFromFlag(props["ES_CONCES"]),
      titular: toText(props["TITULAR"]),
      ubicacion: toText(props["UBICACION"]),
      estado: toText(props["ESTADO"]),
      administrador: toText(props["ADMINIST"]),
      latitud,
      longitud,
      fechaCorte,
    });
  }

  return { rows, rejected };
}
