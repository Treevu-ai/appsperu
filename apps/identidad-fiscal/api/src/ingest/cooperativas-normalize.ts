/**
 * Columnas reales de `ajax/busqueda_ajax.php` (Directorio Nacional de
 * Cooperativas, PRODUCE), en el orden en que llegan en `aaData` — confirmado
 * en vivo el 2026-09-18 capturando la respuesta de `busqueda.php`, que trae
 * el `<thead>` real con las etiquetas de columna (el endpoint AJAX en sí no
 * las expone, solo arrays posicionales):
 *
 *   RUC | RAZON SOCIAL | REPRESENTANTE | DIRECCION | UBIGEO | SOCIOS |
 *   TELEFONO | CORREO | (columna 8: enlace HTML de acción, se descarta)
 *
 * "UBIGEO" es la etiqueta que usa la propia fuente, pero el valor real es
 * un string libre "DEPARTAMENTO-PROVINCIA-DISTRITO" (ej. "LIMA-LIMA-COMAS"),
 * no un código ubigeo de 6 dígitos — se conserva tal cual en
 * `ubicacionTexto`, ver docs/data-contracts/produce-cooperativas.md.
 */
const COL = {
  RUC: 0,
  RAZON_SOCIAL: 1,
  REPRESENTANTE: 2,
  DIRECCION: 3,
  UBICACION_TEXTO: 4,
  SOCIOS: 5,
  TELEFONO: 6,
  CORREO: 7,
} as const;

const MIN_COLUMNS = 8;

export interface NormalizedCooperativa {
  ruc: string;
  razonSocial: string;
  representante: string | null;
  direccion: string | null;
  ubicacionTexto: string | null;
  socios: number | null;
  telefono: string | null;
  correo: string | null;
}

export interface RejectedRow {
  raw: string[];
  reason: string;
}

const NULL_SENTINELS = new Set(["", "-", "NO TIENE"]);

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return NULL_SENTINELS.has(trimmed) ? null : trimmed;
}

/**
 * El campo viene como ", GERENTE: APELLIDOS, Nombres, PRESIDENTE: ..." — se
 * quita la coma/espacio inicial (artefacto de concatenación de la fuente),
 * el resto se conserva sin reestructurar (no hay separador fiable entre
 * nombre y cargo para partirlo en campos individuales sin adivinar).
 */
function cleanRepresentante(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/^,\s*/, "");
  return trimmed === "" ? null : trimmed;
}

function parseSocios(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valida y normaliza una fila ya extraída de `aaData`. No decodifica
 * encoding ni pagina — eso lo hace el connector antes de llamar acá.
 */
export function normalizeCooperativaRow(fields: string[]): NormalizedCooperativa | RejectedRow {
  if (fields.length < MIN_COLUMNS) {
    return { raw: fields, reason: `fila con ${fields.length} columnas, se esperaban al menos ${MIN_COLUMNS}` };
  }

  const ruc = (fields[COL.RUC] ?? "").trim();
  if (!/^\d{11}$/.test(ruc)) {
    return { raw: fields, reason: `RUC inválido: "${ruc}" (se espera 11 dígitos)` };
  }

  const razonSocial = (fields[COL.RAZON_SOCIAL] ?? "").trim();
  if (razonSocial === "") {
    return { raw: fields, reason: "razón social vacía" };
  }

  return {
    ruc,
    razonSocial,
    representante: cleanRepresentante(fields[COL.REPRESENTANTE]),
    direccion: emptyToNull(fields[COL.DIRECCION]),
    ubicacionTexto: emptyToNull(fields[COL.UBICACION_TEXTO]),
    socios: parseSocios(fields[COL.SOCIOS]),
    telefono: emptyToNull(fields[COL.TELEFONO]),
    correo: emptyToNull(fields[COL.CORREO]),
  };
}

export function isRejected(row: NormalizedCooperativa | RejectedRow): row is RejectedRow {
  return "reason" in row;
}
