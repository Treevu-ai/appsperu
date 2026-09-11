/**
 * Normaliza filas ya aplanadas de candidatos ERM 2026 (una fila por persona
 * por lista/cargo) — el aplanado del JSON anidado de la fuente (circunscripción
 * → tipo → ubigeo → lista de organización → candidatos) vive en
 * `candidatos-connector.ts`, no aquí, para poder probar esta normalización
 * sin depender de la forma exacta del JSON de origen.
 */

export interface RawCandidatoRow {
  dni: unknown;
  nombre: unknown;
  cargo: unknown;
  tipo: unknown;
  org: unknown;
  orgEstado: unknown;
  estado: unknown;
  ubigeo: unknown;
  departamento: unknown;
  provincia: unknown;
  distrito: unknown;
  posicion: unknown;
  sexo: unknown;
  edad: unknown;
  provinciaConsejero: unknown;
  sentenciasDeclaradas: unknown;
}

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

const TIPOS_ELECCION = new Set(["REGIONAL", "MUNICIPAL PROVINCIAL", "MUNICIPAL DISTRITAL"]);
const SEXOS = new Set(["M", "F"]);

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

export interface CanonicalCandidato {
  dni: string;
  nombreCompleto: string;
  cargo: string;
  tipoEleccion: string;
  organizacionPolitica: string;
  organizacionEstado: string | null;
  estado: string;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  posicion: number | null;
  sexo: string | null;
  edad: number | null;
  provinciaConsejero: string | null;
  sentenciasDeclaradas: number | null;
}

export interface NormalizeCandidatosResult {
  rows: CanonicalCandidato[];
  rejected: RejectedRow[];
}

export function normalizeCandidatosErm(rawRows: RawCandidatoRow[]): NormalizeCandidatosResult {
  const rows: CanonicalCandidato[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const dniRaw = toText(raw.dni);
    const dni = dniRaw && /^\d{8}$/.test(dniRaw) ? dniRaw : null;
    const nombreCompleto = toText(raw.nombre);
    const cargo = toText(raw.cargo);
    const tipoRaw = toText(raw.tipo);
    const tipoEleccion = tipoRaw && TIPOS_ELECCION.has(tipoRaw.toUpperCase()) ? tipoRaw.toUpperCase() : null;
    const organizacionPolitica = toText(raw.org);
    const estado = toText(raw.estado);

    if (!dni) {
      rejected.push({ raw, reason: dniRaw ? `dni con formato inválido: "${dniRaw}"` : "dni ausente" });
      continue;
    }
    if (!nombreCompleto) {
      rejected.push({ raw, reason: "nombre ausente" });
      continue;
    }
    if (!cargo) {
      rejected.push({ raw, reason: "cargo ausente" });
      continue;
    }
    if (!tipoEleccion) {
      rejected.push({ raw, reason: `tipo de elección ausente o no reconocido: "${tipoRaw}"` });
      continue;
    }
    if (!organizacionPolitica) {
      rejected.push({ raw, reason: "organización política ausente" });
      continue;
    }
    if (!estado) {
      rejected.push({ raw, reason: "estado del candidato ausente" });
      continue;
    }

    const ubigeoRaw = toText(raw.ubigeo);
    const ubigeo = ubigeoRaw && /^\d{6}$/.test(ubigeoRaw) ? ubigeoRaw : null;

    const sexoRaw = toText(raw.sexo);
    const sexo = sexoRaw && SEXOS.has(sexoRaw.toUpperCase()) ? sexoRaw.toUpperCase() : null;

    rows.push({
      dni,
      nombreCompleto,
      cargo,
      tipoEleccion,
      organizacionPolitica,
      organizacionEstado: toText(raw.orgEstado),
      estado,
      ubigeo,
      departamento: toText(raw.departamento),
      provincia: toText(raw.provincia),
      distrito: toText(raw.distrito),
      posicion: toInt(raw.posicion),
      sexo,
      edad: toInt(raw.edad),
      provinciaConsejero: toText(raw.provinciaConsejero),
      sentenciasDeclaradas: toInt(raw.sentenciasDeclaradas),
    });
  }

  return { rows, rejected };
}
