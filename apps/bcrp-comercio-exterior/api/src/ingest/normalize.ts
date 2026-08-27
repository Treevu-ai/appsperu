/** Series nacionales frescas (hasta jun-2026 confirmado en vivo). Ver docs/data-contracts/bcrp-comercio-exterior.md */
export const NATIONAL_TRADE_SERIES = [
  { code: "PN38714BM", key: "exportaciones", category: "exportacion_fob" },
  { code: "PN38715BM", key: "exportaciones_tradicionales", category: "exportacion_fob" },
  { code: "PN38716BM", key: "exportaciones_no_tradicionales", category: "exportacion_fob" },
  { code: "PN38717BM", key: "exportaciones_otros", category: "exportacion_fob" },
  { code: "PN38718BM", key: "importaciones", category: "importacion" },
  { code: "PN38719BM", key: "importaciones_consumo", category: "importacion" },
  { code: "PN38720BM", key: "importaciones_insumos", category: "importacion" },
  { code: "PN38721BM", key: "importaciones_capital", category: "importacion" },
  { code: "PN38722BM", key: "importaciones_otros", category: "importacion" },
  { code: "PN38723BM", key: "balanza_comercial", category: "balanza" },
] as const;

export type TradeSeriesKey = (typeof NATIONAL_TRADE_SERIES)[number]["key"];

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

export interface NormalizedTradeRow {
  seriesCode: string;
  seriesKey: TradeSeriesKey;
  seriesTitle: string;
  category: string;
  periodYear: number;
  periodMonth: number;
  valueUsdMillions: number;
}

export function parsePeriodName(periodName: string): { year: number; month: number } | null {
  const match = /^([A-Za-zÁÉÍÓÚáéíóúñÑ]{3})\.(\d{4})$/.exec(periodName.trim());
  if (!match) return null;
  const month = MONTHS[match[1] as keyof typeof MONTHS];
  const year = Number(match[2]);
  if (!month || !Number.isInteger(year)) return null;
  return { year, month };
}

export function normalizeBcrpResponse(data: BcrpApiResponse): NormalizedTradeRow[] {
  const rows: NormalizedTradeRow[] = [];
  const seriesMeta = NATIONAL_TRADE_SERIES;

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
        periodYear: parsed.year,
        periodMonth: parsed.month,
        valueUsdMillions: value,
      });
    });
  }

  return rows;
}

export function defaultPeriodRange(): { start: string; end: string } {
  const now = new Date();
  const end = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  return { start: "2012-1", end };
}
