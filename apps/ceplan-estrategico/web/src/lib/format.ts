export function formatPct(value: number | null): string {
  if (value === null) return "sin dato";
  return `${value.toFixed(1)}%`;
}

export function formatValor(value: number, unitOfMeasure: string | null): string {
  const formatted = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(value);
  return unitOfMeasure ? `${formatted} ${unitOfMeasure}` : formatted;
}

export function formatFecha(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}

/** Los indicadores CEPLAN traen `measurementDate` como el 1 de enero del año medido. */
export function formatAnio(isoDate: string | null): string {
  if (!isoDate) return "sin dato";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return String(date.getUTCFullYear());
}
