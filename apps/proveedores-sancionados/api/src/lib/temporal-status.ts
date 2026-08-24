export type EstadoTemporal = true | false | "NO_VERIFICABLE";

function toDateOnly(value: unknown): number | null {
  if (value instanceof Date) {
    const utc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    return Number.isNaN(utc) ? null : utc;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(date) ? null : date;
}

/**
 * Responde solo la pregunta temporal verificable: si una inhabilitación
 * cubría la fecha de adjudicación. El estado "VIGENTE" de la exportación es
 * contemporáneo a la extracción y no sustituye este cálculo.
 */
export function vigenteEnFecha(
  fechaAdjudicacion: unknown,
  desde: unknown,
  hasta: unknown
): EstadoTemporal {
  const award = toDateOnly(fechaAdjudicacion);
  const start = toDateOnly(desde);
  const end = toDateOnly(hasta);
  if (award === null || start === null) return "NO_VERIFICABLE";
  if (award < start) return false;
  return end === null || award <= end;
}

export function consolidarEstadoTemporal(estados: EstadoTemporal[]): EstadoTemporal {
  if (estados.some((estado) => estado === true)) return true;
  if (estados.length > 0 && estados.every((estado) => estado === false)) return false;
  return "NO_VERIFICABLE";
}
