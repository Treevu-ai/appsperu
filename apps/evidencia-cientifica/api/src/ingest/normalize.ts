/**
 * Taxonomía de categorías de exportación no tradicional (CLI Market/Rastro).
 * Sirve de alcance por defecto para la ingesta: sin un término de búsqueda
 * delimitado, CrossRef devuelve millones de resultados irrelevantes.
 */
export const DEFAULT_QUERY_TERMS = [
  "cacao",
  "cocoa",
  "quinoa",
  "quinua",
  "maca",
  "arandano",
  "blueberry peru",
  "aguaymanto",
  "physalis peruviana",
  "cafe especial peru",
] as const;

export interface CrossrefWorkItem {
  DOI: string;
  title?: string[];
  publisher?: string;
  subject?: string[];
  score?: number;
  URL?: string;
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  created?: { "date-parts"?: number[][] };
}

export interface CrossrefApiResponse {
  status: string;
  message: {
    "total-results": number;
    items: CrossrefWorkItem[];
    "next-cursor"?: string;
  };
}

export interface NormalizedCrossrefRow {
  doi: string;
  title: string;
  publisher: string | null;
  subjects: string[];
  publishedYear: number | null;
  url: string | null;
  score: number | null;
}

function extractYear(item: CrossrefWorkItem): number | null {
  const parts =
    item["published-print"]?.["date-parts"]?.[0] ??
    item["published-online"]?.["date-parts"]?.[0] ??
    item.created?.["date-parts"]?.[0];
  const year = parts?.[0];
  return typeof year === "number" && Number.isInteger(year) ? year : null;
}

export function normalizeCrossrefResponse(data: CrossrefApiResponse): NormalizedCrossrefRow[] {
  return data.message.items
    .filter((item) => Boolean(item.DOI) && Boolean(item.title?.[0]))
    .map((item) => ({
      doi: item.DOI,
      title: item.title![0],
      publisher: item.publisher ?? null,
      subjects: item.subject ?? [],
      publishedYear: extractYear(item),
      url: item.URL ?? null,
      score: typeof item.score === "number" ? item.score : null,
    }));
}

export function parseQueryTerms(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_QUERY_TERMS];
  const terms = raw
    .split(",")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  return terms.length > 0 ? terms : [...DEFAULT_QUERY_TERMS];
}
