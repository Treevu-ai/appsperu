/** Series nacionales de comercio exterior (millones US$ FOB) */
export const NATIONAL_TRADE_SERIES = [
  { code: "PN38714BM", key: "exportaciones", category: "exportacion_fob", unit: "millones_USD" },
  { code: "PN38715BM", key: "exportaciones_tradicionales", category: "exportacion_fob", unit: "millones_USD" },
  { code: "PN38716BM", key: "exportaciones_no_tradicionales", category: "exportacion_fob", unit: "millones_USD" },
  { code: "PN38717BM", key: "exportaciones_otros", category: "exportacion_fob", unit: "millones_USD" },
  { code: "PN38718BM", key: "importaciones", category: "importacion", unit: "millones_USD" },
  { code: "PN38719BM", key: "importaciones_consumo", category: "importacion", unit: "millones_USD" },
  { code: "PN38720BM", key: "importaciones_insumos", category: "importacion", unit: "millones_USD" },
  { code: "PN38721BM", key: "importaciones_capital", category: "importacion", unit: "millones_USD" },
  { code: "PN38722BM", key: "importaciones_otros", category: "importacion", unit: "millones_USD" },
  { code: "PN38723BM", key: "balanza_comercial", category: "balanza", unit: "millones_USD" },
] as const;

export type TradeSeriesKey = (typeof NATIONAL_TRADE_SERIES)[number]["key"];

/** Series macro nacionales (tipo de cambio, inflación, PBI, tasas de interés) */
export const MACRO_SERIES = [
  { code: "PN01246PM", key: "tipo_cambio_promedio", category: "tipo_cambio", unit: "Soles_por_USD" },
  { code: "PN01271PM", key: "ipc_lima_var_mensual", category: "inflacion", unit: "var_pct" },
  { code: "PN01770AM", key: "pbi_indice", category: "pbi", unit: "indice_2007_100" },
  { code: "PD04722MM", key: "tasa_referencia_politica_monetaria", category: "tasas_interes", unit: "pct" },
] as const;

export type MacroSeriesKey = (typeof MACRO_SERIES)[number]["key"];

export interface BcrpApiResponse {
  config: {
    title: string;
    series: Array<{ name: string; dec: string }>;
  };
  periods: Array<{
    name: string;
    values: string[];
  }>;
}

const MONTHS: Record<string, number> = {
  Ene: 1,
  Feb: 2,
  Mar: 3,
  Abr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Ago: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dic: 12,
};

export interface NormalizedBcrpRow {
  seriesCode: string;
  seriesKey: string;
  seriesTitle: string;
  category: string;
  unit: string;
  periodYear: number;
  periodMonth: number;
  value: number;
}

export function parsePeriodName(periodName: string): { year: number; month: number } | null {
  const match = /^([A-Za-zÁÉÍÓÚáéíóúñÑ]{3})\.(\d{4})$/.exec(periodName.trim());
  if (!match) return null;
  const month = MONTHS[match[1] as keyof typeof MONTHS];
  const year = Number(match[2]);
  if (!month || !Number.isInteger(year)) return null;
  return { year, month };
}

function normalizeWithSeries(
  data: BcrpApiResponse,
  seriesMeta: ReadonlyArray<{ code: string; key: string; category: string; unit: string }>
): NormalizedBcrpRow[] {
  const rows: NormalizedBcrpRow[] = [];

  for (const period of data.periods) {
    const parsed = parsePeriodName(period.name);
    if (!parsed) continue;

    period.values.forEach((rawValue, index) => {
      const meta = seriesMeta[index];
      const title = data.config.series[index]?.name;
      if (!meta || !title) return;

      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;

      rows.push({
        seriesCode: meta.code,
        seriesKey: meta.key,
        seriesTitle: title,
        category: meta.category,
        unit: meta.unit,
        periodYear: parsed.year,
        periodMonth: parsed.month,
        value,
      });
    });
  }

  return rows;
}

export function normalizeBcrpResponse(data: BcrpApiResponse): NormalizedBcrpRow[] {
  return normalizeWithSeries(data, NATIONAL_TRADE_SERIES);
}

export function normalizeMacroBcrpResponse(data: BcrpApiResponse): NormalizedBcrpRow[] {
  return normalizeWithSeries(data, MACRO_SERIES);
}

export function defaultPeriodRange(): { start: string; end: string } {
  const now = new Date();
  const end = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  return { start: "2012-1", end };
}

export function defaultMacroPeriodRange(): { start: string; end: string } {
  const now = new Date();
  const end = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  return { start: "1992-1", end };
}