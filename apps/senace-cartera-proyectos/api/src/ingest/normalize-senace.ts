export interface CanonicalProyecto {
  senaceId: number;
  titular: string | null;
  ruc: string | null;
  tituloProyecto: string | null;
  unidadProyecto: string | null;
  tipo: string | null;
  actividad: string | null;
  fechaInicio: string | null;
  estado: string;
  descripcion: string | null;
  longitud: number | null;
  latitud: number | null;
  resolucion: string | null;
}

export interface RejectedRow {
  raw: unknown;
  reason: string;
}

const RUC_PATTERN = /^\d{11}$/;
const FECHA_DDMMYYYY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRuc(value: unknown): string | null {
  const str = toNullableString(value);
  return str && RUC_PATTERN.test(str) ? str : null;
}

/**
 * La fuente devuelve `FECHA_INICIO` como texto `DD/MM/YYYY` (confirmado en vivo, ver
 * docs/data-contracts/senace-cartera-proyectos.md) -- se convierte a `YYYY-MM-DD` para la
 * columna `DATE`. Una fecha con formato inesperado no rechaza la fila -- solo queda `null`,
 * igual que cualquier otro campo opcional.
 */
function toFechaInicio(value: unknown): string | null {
  const str = toNullableString(value);
  if (!str) return null;
  const match = FECHA_DDMMYYYY.exec(str);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeProyectos(rawRows: readonly Record<string, unknown>[]): {
  rows: CanonicalProyecto[];
  rejected: RejectedRow[];
} {
  const rows: CanonicalProyecto[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const senaceId = raw.ID;
    if (typeof senaceId !== "number" || !Number.isInteger(senaceId)) {
      rejected.push({ raw, reason: "ID ausente o no es un entero." });
      continue;
    }
    const estado = toNullableString(raw.ESTADO);
    if (!estado) {
      rejected.push({ raw, reason: "ESTADO ausente." });
      continue;
    }

    rows.push({
      senaceId,
      titular: toNullableString(raw.TITULAR),
      ruc: toRuc(raw.RUC),
      tituloProyecto: toNullableString(raw.TITULO_PROYECTO),
      unidadProyecto: toNullableString(raw.UNIDAD_PROYECTO),
      tipo: toNullableString(raw.TIPO),
      actividad: toNullableString(raw.ACTIVIDAD),
      fechaInicio: toFechaInicio(raw.FECHA_INICIO),
      estado,
      descripcion: toNullableString(raw.DESCRIPCION),
      longitud: toNullableNumber(raw.LONGITUD),
      latitud: toNullableNumber(raw.LATITUD),
      resolucion: toNullableString(raw.RESOLUCION),
    });
  }

  return { rows, rejected };
}
