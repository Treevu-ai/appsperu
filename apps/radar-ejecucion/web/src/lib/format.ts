const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

export function formatSoles(value: number): string {
  return currencyFormatter.format(value);
}

export function formatPct(value: number | null): string {
  if (value === null) return "sin dato";
  return `${value.toFixed(1)}%`;
}

export function formatFecha(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}
