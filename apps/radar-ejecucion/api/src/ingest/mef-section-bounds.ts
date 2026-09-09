/**
 * Límites de byte por (nivel de gobierno, mes) en `2026-Gasto-Mensual.csv`.
 * Cubren TODOS los departamentos dentro de cada sección — derivados de los
 * offsets observados para LA LIBERTAD + inicio del bloque Nacional (ADR-0006).
 * Ver comentarios en mef-connector.ts.
 */
export type SectionBounds = { start: number; end: number };

/**
 * Prefijo UBIGEO departamental (2 dígitos, catálogo INEI) para las 25
 * jurisdicciones — usado por `ejecutoraLineNeedles()` en mef-connector.ts
 * para construir un needle de línea preciso al escanear Gobiernos Locales
 * (evita falsos positivos por coincidencia de nombre). No confundir con
 * `PILOT_DEPARTMENT_UBIGEO` de `lib/pilot-departments.ts`, que es un
 * subconjunto de 5 regiones ligado a una decisión de producto (ALSOL Fase 2)
 * compartida con ceplan-geo/ceplan-estrategico — esta tabla es de alcance
 * puramente territorial/técnico (CT-10).
 */
export const DEPARTAMENTO_UBIGEO_PREFIJO: Record<(typeof DEPARTAMENTO_ALFABETICO)[number], string> = {
  AMAZONAS: "01",
  ANCASH: "02",
  APURIMAC: "03",
  AREQUIPA: "04",
  AYACUCHO: "05",
  CAJAMARCA: "06",
  CALLAO: "07",
  CUSCO: "08",
  HUANCAVELICA: "09",
  HUANUCO: "10",
  ICA: "11",
  JUNIN: "12",
  "LA LIBERTAD": "13",
  LAMBAYEQUE: "14",
  LIMA: "15",
  LORETO: "16",
  "MADRE DE DIOS": "17",
  MOQUEGUA: "18",
  PASCO: "19",
  PIURA: "20",
  PUNO: "21",
  "SAN MARTIN": "22",
  TACNA: "23",
  TUMBES: "24",
  UCAYALI: "25",
};

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

/**
 * Offsets dept-específicos confirmados para LA LIBERTAD (ADR-0006),
 * calibrados contra el archivo `2026-Gasto-Mensual.csv` de ~6.2 GB
 * (2026-08). **Desactualizados desde la recalibración de CT-10
 * (2026-09-09, archivo creció a 7.03 GB al sumarse MES_EJE=8)** — no se
 * recalibraron porque `departamentoSectionWindow()` solo los usa como un
 * atajo de rendimiento (ventana angosta) para LA LIBERTAD; si apuntan al
 * tramo equivocado, el filtro por departamento simplemente no encuentra
 * coincidencias y `ingestMefFullYearForDepartamento` cae al escaneo
 * completo de la sección (`fetchDepartamentoRowsInSection`), que sí usa los
 * límites recalibrados de `SECTION_NIVEL_MES_BOUNDS` y es correcto para
 * cualquier departamento. Es decir: quedar desactualizados aquí cuesta
 * banda ancha extra, nunca produce un resultado incorrecto.
 */
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

/**
 * Recalibrado CT-10 (2026-09-09) vía búsqueda binaria sobre bytes reales del
 * archivo remoto (mismo método usado originalmente para
 * `NACIONAL_MES_START_BYTE` en mef-connector.ts) — el archivo creció de
 * 6,240,885,549 a 7,029,320,981 bytes desde la calibración anterior
 * (2026-08), principalmente porque se sumó `MES_EJE=8` (agosto). Estos
 * límites cambian cada vez que el archivo del MEF crece lo suficiente para
 * que `assertMefFileSizeWithinTolerance` (tolerancia 2%) empiece a fallar —
 * volver a correr `recalibrate-mef-bounds` (ver notas de CT-10) cuando eso
 * pase, no solo subir la tolerancia.
 */
export const SECTION_NIVEL_MES_BOUNDS: Record<string, Record<string, SectionBounds>> = {
  "GOBIERNOS REGIONALES": {
    "8": { start: 0, end: 186_759_131 },
    "7": { start: 186_759_131, end: 396_832_107 },
    "6": { start: 396_832_107, end: 583_171_930 },
    "5": { start: 583_171_930, end: 763_552_027 },
    "4": { start: 763_552_027, end: 937_447_278 },
    "3": { start: 937_447_278, end: 1_098_806_662 },
    "2": { start: 1_098_806_662, end: 1_230_044_268 },
    "1": { start: 1_230_044_268, end: 1_347_628_575 },
    "0": { start: 1_347_628_575, end: 1_723_228_607 },
  },
  "GOBIERNOS LOCALES": {
    "8": { start: 1_723_228_607, end: 2_108_859_024 },
    "7": { start: 2_108_859_024, end: 2_512_905_817 },
    "6": { start: 2_512_905_817, end: 2_885_703_503 },
    "5": { start: 2_885_703_503, end: 3_264_906_761 },
    "4": { start: 3_264_906_761, end: 3_636_466_898 },
    "3": { start: 3_636_466_898, end: 4_005_784_841 },
    "2": { start: 4_005_784_841, end: 4_327_802_289 },
    "1": { start: 4_327_802_289, end: 4_569_550_167 },
    "0": { start: 4_569_550_167, end: 5_377_593_670 },
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
