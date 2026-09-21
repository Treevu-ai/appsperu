/**
 * Fuente real (confirmado en vivo 2026-09-20): CSV separado por `|`, con
 * encabezado, publicado por OECE en un espacio de Confluence propio (no
 * datosabiertos.gob.pe/CKAN directo — ver el conector para el detalle de
 * cómo se resuelve la URL de descarga).
 *
 * Columnas reales: FECHA_CORTE|RUC_DNI|NOMBRE_RAZONODENOMINACIONSOCIAL|
 *   ORGANO_JURISDICCIONAL|NUMERO_RESOLUCION|FECHA_INICIO|FECHA_FIN
 *
 * Fechas vienen como YYYYMMDD (ej. "20260901"), no DD/MM/YYYY como el resto
 * del catálogo de esta app (`inhabilitaciones`/`multas`, ver normalize.ts).
 */

const EXPECTED_COLS = 7;

export interface NormalizedInhabilitacionJudicial {
  fechaCorte: string; // YYYY-MM-DD
  rucDni: string;
  nombre: string;
  organoJurisdiccional: string;
  numeroResolucion: string;
  fechaInicio: string | null;
  fechaFin: string | null;
}

export interface RejectedRow {
  raw: string[];
  reason: string;
}

/**
 * Valida que sea una fecha calendario real (ej. rechaza 20240231) — Date
 * normaliza silenciosamente días fuera de rango en vez de lanzar, así que se
 * verifica con un round-trip contra los componentes originales. Mismo patrón
 * que `parseFechaDDMMYYYY` en `servicios-salud/api/src/ingest/cenares-parse.ts`
 * (CT-10/2026-09-19), adaptado al formato YYYYMMDD de esta fuente.
 */
export function parseFechaYYYYMMDD(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  const year = Number(yyyy);
  const month = Number(mm);
  const day = Number(dd);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Parsea el CSV crudo (separado por `|`) fila por fila, separando aceptadas de rechazadas — nunca inserta con columnas corridas en silencio. */
export function parseInhabilitacionesJudicialesCsv(csvText: string): {
  accepted: NormalizedInhabilitacionJudicial[];
  rejected: RejectedRow[];
} {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  const accepted: NormalizedInhabilitacionJudicial[] = [];
  const rejected: RejectedRow[] = [];

  for (const line of lines) {
    const cells = line.split("|");

    // La fila de encabezado real SÍ tiene el número esperado de columnas
    // (los nombres de columna, separados por "|") -- se detecta por
    // contenido, no se salta en silencio junto con estructuras rotas.
    if (/^FECHA_CORTE$/i.test((cells[0] ?? "").trim())) continue;

    if (cells.length !== EXPECTED_COLS) {
      rejected.push({ raw: cells, reason: `número de columnas inesperado (${cells.length}, se esperaban ${EXPECTED_COLS})` });
      continue;
    }

    const [fechaCorteRaw, rucDniRaw, nombreRaw, organoRaw, resolucionRaw, fechaInicioRaw, fechaFinRaw] = cells;

    const fechaCorte = parseFechaYYYYMMDD(fechaCorteRaw);
    const rucDni = emptyToNull(rucDniRaw);
    const nombre = emptyToNull(nombreRaw);
    const organoJurisdiccional = emptyToNull(organoRaw);
    const numeroResolucion = emptyToNull(resolucionRaw);
    const fechaInicio = parseFechaYYYYMMDD(fechaInicioRaw);
    const fechaFin = parseFechaYYYYMMDD(fechaFinRaw);

    if (!fechaCorte) {
      rejected.push({ raw: cells, reason: "fecha_corte inválida o vacía" });
      continue;
    }
    if (!rucDni) {
      rejected.push({ raw: cells, reason: "ruc_dni vacío" });
      continue;
    }
    if (!nombre) {
      rejected.push({ raw: cells, reason: "nombre vacío" });
      continue;
    }
    if (!organoJurisdiccional) {
      rejected.push({ raw: cells, reason: "organo_jurisdiccional vacío" });
      continue;
    }
    if (!numeroResolucion) {
      rejected.push({ raw: cells, reason: "numero_resolucion vacío" });
      continue;
    }
    // Hallazgo real verificado en vivo (2026-09-20): al menos 1 fila de la
    // fuente trae fecha_inicio posterior a fecha_fin (invertidas) — se
    // rechaza en vez de adivinar cuál es la correcta o intercambiarlas.
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      rejected.push({ raw: cells, reason: "fecha_inicio posterior a fecha_fin" });
      continue;
    }

    accepted.push({ fechaCorte, rucDni, nombre, organoJurisdiccional, numeroResolucion, fechaInicio, fechaFin });
  }

  return { accepted, rejected };
}
