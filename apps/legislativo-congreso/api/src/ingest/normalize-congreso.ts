/**
 * Normaliza filas de `POST /spley-portal-service/proyecto-ley/lista-con-filtro`.
 *
 * Sin PII: `proponente`/`autores` son congresistas y entidades públicas (funcionarios
 * públicos), no hay dato personal de ciudadanos particulares en esta fuente.
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
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Igual criterio que `violencia-escolar/ingest/normalize-siseve.ts`: `new Date("2024-02-31")`
 * no lanza error, JS lo normaliza en silencio -- se reconstruye la fecha en UTC y se compara
 * contra los componentes originales del texto.
 */
function isValidIsoDateText(text: string): boolean {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * `fecPresentacion` llega como `"2026-07-22T00:00:00.000-05:00"` (verificado en vivo) -- se toma
 * solo la parte de fecha antes de "T" y se valida que sea una fecha real, no solo el formato.
 */
function toDateOnly(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  const datePart = text.split("T")[0];
  return isValidIsoDateText(datePart) ? datePart : null;
}

export interface CanonicalProyecto {
  perParId: number;
  pleyNum: number;
  proyectoLey: string;
  estado: string;
  fechaPresentacion: string | null;
  titulo: string;
  proponente: string | null;
  autores: string | null;
  codTipoParl: string | null;
  codTipoParlActual: string | null;
}

export interface NormalizeProyectosResult {
  rows: CanonicalProyecto[];
  rejected: RejectedRow[];
}

export function normalizeProyectos(rawRows: Record<string, unknown>[]): NormalizeProyectosResult {
  const rows: CanonicalProyecto[] = [];
  const rejected: RejectedRow[] = [];

  for (const raw of rawRows) {
    const perParId = toInt(raw["perParId"]);
    const pleyNum = toInt(raw["pleyNum"]);
    const proyectoLey = toText(raw["proyectoLey"]);
    const estado = toText(raw["desEstado"]);
    const titulo = toText(raw["titulo"]);

    if (perParId === null) {
      rejected.push({ raw, reason: "perParId ausente o inválido" });
      continue;
    }
    if (pleyNum === null) {
      rejected.push({ raw, reason: "pleyNum ausente o inválido" });
      continue;
    }
    if (!proyectoLey) {
      rejected.push({ raw, reason: "proyectoLey ausente" });
      continue;
    }
    if (!estado) {
      rejected.push({ raw, reason: "desEstado ausente" });
      continue;
    }
    if (!titulo) {
      rejected.push({ raw, reason: "titulo ausente" });
      continue;
    }

    rows.push({
      perParId,
      pleyNum,
      proyectoLey,
      estado,
      fechaPresentacion: toDateOnly(raw["fecPresentacion"]),
      titulo,
      proponente: toText(raw["desProponente"]),
      autores: toText(raw["autores"]),
      codTipoParl: toText(raw["codTipoParl"]),
      codTipoParlActual: toText(raw["codTipoParlActual"]),
    });
  }

  return { rows, rejected };
}
