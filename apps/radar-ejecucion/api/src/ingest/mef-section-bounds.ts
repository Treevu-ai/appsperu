/**
 * Límites de byte por (nivel de gobierno, mes) en `2026-Gasto-Mensual.csv`.
 * Cubren TODOS los departamentos dentro de cada sección — derivados de los
 * offsets observados para LA LIBERTAD + inicio del bloque Nacional (ADR-0006).
 * Ver comentarios en mef-connector.ts.
 */
export type SectionBounds = { start: number; end: number };

/** Orden alfabético observado dentro de cada sección GR/GL del CSV MEF. */
export const DEPARTAMENTO_ALFABETICO = [
  "AMAZONAS",
  "ANCASH",
  "APURIMAC",
  "AREQUIPA",
  "AYACUCHO",
  "CAJAMARCA",
  "CALLAO",
  "CUSCO",
  "HUANCAVELICA",
  "HUANUCO",
  "ICA",
  "JUNIN",
  "LA LIBERTAD",
  "LAMBAYEQUE",
  "LIMA",
  "LORETO",
  "MADRE DE DIOS",
  "MOQUEGUA",
  "PASCO",
  "PIURA",
  "PUNO",
  "SAN MARTIN",
  "TACNA",
  "TUMBES",
  "UCAYALI",
] as const;

/** Offsets dept-específicos confirmados para LA LIBERTAD (ADR-0006). */
export const SECTION_OFFSETS_LA_LIBERTAD: Record<string, Record<string, number>> = {
  "GOBIERNOS REGIONALES": {
    "7": 120_000_000,
    "6": 320_000_000,
    "5": 500_000_000,
    "4": 680_000_000,
    "3": 840_000_000,
    "2": 984_000_000,
    "1": 1_112_000_000,
    "0": 1_368_000_000,
  },
  "GOBIERNOS LOCALES": {
    "7": 1_760_000_000,
    "6": 2_150_000_000,
    "5": 2_525_000_000,
    "4": 2_900_000_000,
    "3": 3_275_000_000,
    "2": 3_605_000_000,
    "1": 3_875_000_000,
    "0": 4_415_000_000,
  },
};

const SECTION_LOOKBACK_BYTES = 20 * 1024 * 1024;
const SECTION_WINDOW_BYTES = 60 * 1024 * 1024;

export const SECTION_NIVEL_MES_BOUNDS: Record<string, Record<string, SectionBounds>> = {
  "GOBIERNOS REGIONALES": {
    "7": { start: 0, end: 300_000_000 },
    "6": { start: 300_000_000, end: 480_000_000 },
    "5": { start: 480_000_000, end: 640_000_000 },
    "4": { start: 640_000_000, end: 820_000_000 },
    "3": { start: 820_000_000, end: 964_000_000 },
    "2": { start: 964_000_000, end: 1_092_000_000 },
    "1": { start: 1_092_000_000, end: 1_348_000_000 },
    "0": { start: 1_348_000_000, end: 1_740_000_000 },
  },
  "GOBIERNOS LOCALES": {
    "7": { start: 1_740_000_000, end: 2_130_000_000 },
    "6": { start: 2_130_000_000, end: 2_505_000_000 },
    "5": { start: 2_505_000_000, end: 2_875_000_000 },
    "4": { start: 2_875_000_000, end: 3_275_000_000 },
    "3": { start: 3_275_000_000, end: 3_605_000_000 },
    "2": { start: 3_605_000_000, end: 3_875_000_000 },
    "1": { start: 3_875_000_000, end: 4_415_000_000 },
    "0": { start: 4_415_000_000, end: 4_767_552_175 },
  },
};

export function sectionWindowBytes(bounds: SectionBounds): number {
  return bounds.end - bounds.start;
}

/**
 * Ventana angosta (~60 MB) centrada en el bloque alfabético del departamento
 * dentro de una sección GR/GL. Usa offsets confirmados para LA LIBERTAD;
 * para el resto interpola posición alfabética dentro de los límites de sección.
 */
export function departamentoSectionWindow(
  nivelGobierno: string,
  mesEje: string,
  bounds: SectionBounds,
  departamento: string
): { startByte: number; maxBytes: number } {
  const dept = departamento.toUpperCase().trim();
  const confirmed = SECTION_OFFSETS_LA_LIBERTAD[nivelGobierno]?.[mesEje];
  const center =
    dept === "LA LIBERTAD" && confirmed !== undefined
      ? confirmed
      : estimateDepartamentoCenter(bounds, dept);

  const startByte = Math.max(bounds.start, center - SECTION_LOOKBACK_BYTES);
  const endByte = Math.min(bounds.end, startByte + SECTION_WINDOW_BYTES);
  return { startByte, maxBytes: endByte - startByte };
}

function estimateDepartamentoCenter(bounds: SectionBounds, departamento: string): number {
  const idx = DEPARTAMENTO_ALFABETICO.indexOf(departamento as (typeof DEPARTAMENTO_ALFABETICO)[number]);
  const ratio = idx >= 0 ? (idx + 0.5) / DEPARTAMENTO_ALFABETICO.length : 0.5;
  const span = bounds.end - bounds.start;
  return bounds.start + Math.floor(ratio * span);
}
