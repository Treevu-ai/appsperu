/**
 * Exporta a CSV las exportaciones de Perú hacia los países del CPTPP y
 * China desde la API pública de WITS (World Bank), sin necesidad de
 * autenticación — alternativa/complemento a Comtrade (ver data/raw/README.md).
 *
 * IMPORTANTE — diferencia de clasificación: con `product=all`, WITS NO
 * devuelve capítulos arancelarios HS de 2 dígitos (como `comtrade_flujos`,
 * columna `cmd_code`), sino sus propios grupos de producto agregados
 * (ej. "09-10_Coffee&Co", "16-24_FoodProd"). Verificado en vivo el
 * 2026-10-15 contra la API real. NO es comparable fila a fila con el
 * `cmd_code` de Comtrade sin una tabla de equivalencias — no se asume
 * ninguna aquí. Útil para cruce a nivel agregado o como fuente
 * independiente de validación, no como reemplazo directo de Comtrade a
 * nivel de capítulo HS.
 *
 * Indicador usado: XPRT-TRD-VL (valor de exportación, miles de USD).
 *
 * Uso:
 *   npx tsx 03_export_wits.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(import.meta.dirname, "..", "data", "raw");
const REPORTER = "PER";
const PARTNERS: Record<string, string> = {
  AUS: "Australia",
  BRN: "Brunéi Darussalam",
  CAN: "Canadá",
  CHL: "Chile",
  CHN: "China",
  JPN: "Japón",
  MYS: "Malasia",
  MEX: "México",
  NZL: "Nueva Zelanda",
  SGP: "Singapur",
  VNM: "Vietnam",
  GBR: "Reino Unido",
};
const ANIOS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const INDICADOR = "XPRT-TRD-VL";
const DELAY_MS = 500;

interface Fila {
  anio: number;
  partner: string;
  productCode: string;
  valorMilesUsd: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSeries(xml: string, anio: number, partner: string): Fila[] {
  const filas: Fila[] = [];
  const seriesRegex = /<Series[^>]*PRODUCTCODE="([^"]+)"[^>]*>(.*?)<\/Series>/gs;
  let m: RegExpExecArray | null;
  while ((m = seriesRegex.exec(xml)) !== null) {
    const productCode = m[1];
    const obsMatch = /<Obs TIME_PERIOD="(\d+)" OBS_VALUE="([^"]+)"/.exec(m[2]);
    if (obsMatch) {
      filas.push({ anio, partner, productCode, valorMilesUsd: Number(obsMatch[2]) });
    }
  }
  return filas;
}

async function fetchPartnerAnio(partner: string, anio: number): Promise<Fila[]> {
  const url = `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/reporter/${REPORTER}/year/${anio}/partner/${partner}/product/all/indicator/${INDICADOR}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  error ${res.status} para ${partner} ${anio}`);
    return [];
  }
  const xml = await res.text();
  return parseSeries(xml, anio, partner);
}

async function main() {
  const todas: Fila[] = [];
  for (const [codigo, nombre] of Object.entries(PARTNERS)) {
    let filasPartner = 0;
    for (const anio of ANIOS) {
      const filas = await fetchPartnerAnio(codigo, anio);
      todas.push(...filas);
      filasPartner += filas.length;
      await sleep(DELAY_MS);
    }
    console.log(`${nombre} (${codigo}): ${filasPartner} filas`);
  }

  const header = "anio,partner_iso3,partner_nombre,wits_product_code,valor_miles_usd";
  const lines = todas.map(
    (f) => `${f.anio},${f.partner},"${PARTNERS[f.partner]}",${f.productCode},${f.valorMilesUsd}`
  );
  const outPath = join(OUT_DIR, "wits_exportaciones_peru.csv");
  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");
  console.log(`\nEscrito ${outPath} (${todas.length} filas totales)`);
}

main().catch((err) => {
  console.error("Falló la exportación WITS:", err);
  process.exit(1);
});
