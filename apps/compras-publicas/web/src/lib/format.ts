const currencyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

export function formatSoles(value: number | null): string {
  if (value === null) return "sin dato";
  return currencyFormatter.format(value);
}

export function formatFecha(isoDate: string | null): string {
  if (!isoDate) return "sin fecha";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date);
}

const CATEGORIA_LABELS: Record<string, string> = {
  goods: "Bienes",
  works: "Obras",
  services: "Servicios",
};

export function formatCategoria(categoria: string | null): string {
  if (!categoria) return "sin categoría";
  return CATEGORIA_LABELS[categoria] ?? categoria;
}
