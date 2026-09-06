/**
 * Normaliza filas del CSV RENAMU 2024 (una fila por municipalidad) hacia el
 * esquema canónico parcial (identificación + vehículos + conectividad — ver
 * el comentario de alcance en `db/migrations/001_init.sql`).
 *
 * Confirmado contra filas reales del CSV (no solo el diccionario, cuyo layout
 * de tabla se linealiza fuera de orden al extraer texto de PDF): `P11A_N`
 * trae "1"/"2" (Sí/No), `P11A_N_1`/`P11A_N_2` traen la cantidad
 * operativa/no operativa (blanco si `P11A_N` = "2"). `P14A_1` es la cantidad
 * de computadoras con internet (no el tipo de conexión, como sugería una
 * lectura ingenua del diccionario) y `P14A_2` es el código de tipo de
 * conexión (1-5) — el orden real solo quedó claro al inspeccionar filas
 * reales del CSV 2026-09-06.
 */

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toInt(value: unknown): number | null {
  const text = toText(value);
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(value: unknown, trueValue = "1"): boolean | null {
  const text = toText(value);
  if (text === null) return null;
  return text === trueValue;
}

// --- Municipalidad (identificación) ----------------------------------------

export interface CanonicalMunicipalidad {
  anio: number;
  idmunici: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  tipomuni: "1" | "2" | "3";
}

export interface NormalizeMunicipalidadesResult {
  rows: CanonicalMunicipalidad[];
  rejected: RejectedRow[];
}

export function normalizeMunicipalidades(rawRows: Record<string, unknown>[]): NormalizeMunicipalidadesResult {
  const rows: CanonicalMunicipalidad[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const anio = toInt(raw["Año"]);
    const idmunici = toText(raw["idmunici"]);
    const ubigeo = toText(raw["Ubigeo"]);
    const departamento = toText(raw["Departamento"]);
    const provincia = toText(raw["Provincia"]);
    const distrito = toText(raw["Distrito"]);
    const tipomuni = toText(raw["Tipomuni"]);

    if (anio === null) {
      rejected.push({ raw, reason: "Año ausente o no numérico" });
      continue;
    }
    if (!idmunici) {
      rejected.push({ raw, reason: "idmunici ausente" });
      continue;
    }
    if (!ubigeo || !/^\d{6}$/.test(ubigeo)) {
      rejected.push({ raw, reason: "Ubigeo ausente o no tiene 6 dígitos" });
      continue;
    }
    if (!departamento || !provincia || !distrito) {
      rejected.push({ raw, reason: "Departamento/Provincia/Distrito ausente" });
      continue;
    }
    if (tipomuni !== "1" && tipomuni !== "2" && tipomuni !== "3") {
      rejected.push({ raw, reason: "Tipomuni ausente o fuera de rango (1/2/3)" });
      continue;
    }

    rows.push({ anio, idmunici, ubigeo, departamento, provincia, distrito, tipomuni });
  }

  return { rows, rejected };
}

// --- Vehículos (Módulo II, bloque P11A) ------------------------------------

export const VEHICULO_ITEMS: ReadonlyArray<{ codigo: string; descripcion: string }> = [
  { codigo: "P11A_1", descripcion: "Auto y/o camioneta" },
  { codigo: "P11A_2", descripcion: "Motocicleta" },
  { codigo: "P11A_3", descripcion: "Ambulancia" },
  { codigo: "P11A_4", descripcion: "Volquete" },
  { codigo: "P11A_5", descripcion: "Camión recolector de basura (camión compactador)" },
  { codigo: "P11A_6", descripcion: "Camión cisterna" },
  { codigo: "P11A_7", descripcion: "Camión (no incluye recolectores de basura ni cisternas)" },
  { codigo: "P11A_8", descripcion: "Grupo electrógeno" },
  { codigo: "P11A_9", descripcion: "Panel solar" },
  { codigo: "P11A_10", descripcion: "Otro vehículo y/o equipo" },
];

export interface CanonicalVehiculo {
  itemCodigo: string;
  itemDescripcion: string;
  tiene: boolean;
  cantidadOperativa: number | null;
  cantidadNoOperativa: number | null;
  especifique: string | null;
}

export function normalizeVehiculos(raw: Record<string, unknown>): CanonicalVehiculo[] {
  const items: CanonicalVehiculo[] = [];

  for (const { codigo, descripcion } of VEHICULO_ITEMS) {
    const tiene = toBool(raw[codigo]);
    if (tiene === null) continue; // municipalidad no informó esta pregunta

    items.push({
      itemCodigo: codigo,
      itemDescripcion: descripcion,
      tiene,
      cantidadOperativa: toInt(raw[`${codigo}_1`]),
      cantidadNoOperativa: toInt(raw[`${codigo}_2`]),
      especifique: codigo === "P11A_10" ? toText(raw["P11A_10_O"]) : null,
    });
  }

  return items;
}

// --- Conectividad (Módulo II, bloques P12 y P14) ---------------------------

export interface CanonicalConectividad {
  tieneLineaFija: boolean;
  lineasFijas: number | null;
  tieneLineaMovil: boolean;
  lineasMoviles: number | null;
  tieneInternet: boolean;
  computadorasConInternet: number | null;
  tipoConexionCodigo: number | null;
}

export function normalizeConectividad(raw: Record<string, unknown>): CanonicalConectividad | null {
  const tieneLineaFija = toBool(raw["P12_1"]);
  const tieneLineaMovil = toBool(raw["P12_2"]);
  const tieneInternet = toBool(raw["P14"]);

  if (tieneLineaFija === null || tieneLineaMovil === null || tieneInternet === null) {
    return null;
  }

  return {
    tieneLineaFija,
    lineasFijas: toInt(raw["P12A_1"]),
    tieneLineaMovil,
    lineasMoviles: toInt(raw["P12A_2"]),
    tieneInternet,
    computadorasConInternet: toInt(raw["P14A_1"]),
    tipoConexionCodigo: toInt(raw["P14A_2"]),
  };
}
