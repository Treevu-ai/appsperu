/**
 * VUL-17/18/19 (v3, dimensión TBML): cruce entre el inventario MTC
 * (`terminales_portuarios`) y `port_subpartida_imports` de `sunat-aduanas`
 * (Anuario SUNAT cdro_16: FOB/CIF por aduana × subpartida × año), para
 * aproximar exposición a comercio exterior sub/sobrevalorado (trade-based
 * money laundering) — ver investigación de metodologías en la conversación
 * de 2026-10-05 y `docs/indice-vulnerabilidad-v3-oecd-tbml.md`.
 *
 * Por qué razón CIF/FOB y no precio-por-unidad: `port_subpartida_imports`
 * no tiene columna de cantidad/peso (solo valores en USD), así que no se
 * puede calcular precio-por-kg contra un benchmark externo (UN Comtrade,
 * como sugiere FATF). La señal que SÍ es computable con lo que ya existe es
 * la razón CIF/FOB — el flete+seguro declarado como fracción del valor FOB
 * debería ser razonablemente estable entre aduanas para la misma subpartida
 * (mismas rutas, mismos regímenes); una desviación grande frente a la
 * mediana nacional de esa subpartida es la misma lógica del red-flag FATF
 * de "discrepancia significativa de valor declarado", con benchmark interno
 * en vez de externo.
 */

export interface ImportRow {
  aduanaCode: number;
  aduanaName: string;
  year: number;
  subpartida: string;
  fobUsd: number;
  cifUsd: number;
}

export interface AduanaTbmlScore {
  aduanaName: string;
  /** Fracción (0-1) del valor FOB total de la aduana que cae en filas "anómalas". */
  pctValorAnomalo: number;
  filasAnomalas: number;
  filasTotal: number;
  fobTotal: number;
}

/** Umbral de desviación relativa frente a la mediana nacional de la subpartida — el mismo 20% que usa FATF para "discrepancia significativa" en sus red flags de TBML. */
export const UMBRAL_DESVIACION = 0.20;

/** Mínimo de aduanas reportando la misma subpartida para que su mediana sea representativa — por debajo de esto, la "mediana" de 1-2 observaciones no es un benchmark, es ruido. */
export const MIN_ADUANAS_PARA_MEDIANA = 3;

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0 ? (ordenados[mid - 1] + ordenados[mid]) / 2 : ordenados[mid];
}

/**
 * Calcula, para cada aduana, qué fracción de su valor FOB importado cae en
 * filas (aduana, subpartida, año) cuya razón CIF/FOB se desvía más de
 * `UMBRAL_DESVIACION` de la mediana nacional de esa subpartida en ese año.
 *
 * Cada (subpartida, año) se trata como una población de observaciones
 * independiente — no se mezclan 2023 y 2024 al calcular la mediana, porque
 * el flete internacional (componente dominante de CIF-FOB) varía por año.
 */
export function computeTbmlScoresByAduana(rows: readonly ImportRow[]): Map<string, AduanaTbmlScore> {
  // 1. Agrupar por (subpartida, año) para la mediana nacional.
  const ratiosPorSubpartidaAnio = new Map<string, number[]>();
  const keyOf = (subpartida: string, year: number) => `${subpartida}|${year}`;

  for (const r of rows) {
    if (r.fobUsd <= 0) continue; // ratio indefinida/sin sentido sin FOB positivo
    const ratio = r.cifUsd / r.fobUsd;
    const key = keyOf(r.subpartida, r.year);
    const lista = ratiosPorSubpartidaAnio.get(key) ?? [];
    lista.push(ratio);
    ratiosPorSubpartidaAnio.set(key, lista);
  }

  const medianaPorSubpartidaAnio = new Map<string, number>();
  for (const [key, ratios] of ratiosPorSubpartidaAnio) {
    if (ratios.length >= MIN_ADUANAS_PARA_MEDIANA) {
      medianaPorSubpartidaAnio.set(key, mediana(ratios));
    }
  }

  // 2. Para cada fila, decidir si es anómala frente a la mediana de su (subpartida, año).
  const acumulado = new Map<string, { fobAnomalo: number; fobTotal: number; filasAnomalas: number; filasTotal: number }>();

  for (const r of rows) {
    if (r.fobUsd <= 0) continue;
    const key = keyOf(r.subpartida, r.year);
    const med = medianaPorSubpartidaAnio.get(key);
    if (med === undefined) continue; // sin benchmark robusto para esta subpartida/año — no se cuenta ni a favor ni en contra

    const acc = acumulado.get(r.aduanaName) ?? { fobAnomalo: 0, fobTotal: 0, filasAnomalas: 0, filasTotal: 0 };
    const ratio = r.cifUsd / r.fobUsd;
    const desviacion = Math.abs(ratio - med) / med;

    acc.fobTotal += r.fobUsd;
    acc.filasTotal += 1;
    if (desviacion > UMBRAL_DESVIACION) {
      acc.fobAnomalo += r.fobUsd;
      acc.filasAnomalas += 1;
    }
    acumulado.set(r.aduanaName, acc);
  }

  const resultado = new Map<string, AduanaTbmlScore>();
  for (const [aduanaName, acc] of acumulado) {
    resultado.set(aduanaName, {
      aduanaName,
      pctValorAnomalo: acc.fobTotal > 0 ? acc.fobAnomalo / acc.fobTotal : 0,
      filasAnomalas: acc.filasAnomalas,
      filasTotal: acc.filasTotal,
      fobTotal: acc.fobTotal,
    });
  }
  return resultado;
}

/**
 * Nombres de aduana (SUNAT) que son puertos/terminales fluviales/marítimos
 * relevantes para el índice — excluye pasos de frontera terrestres
 * (TACNA, DESAGUADERO, LA TINA, CHICLAYO) y el aéreo/postal, que no tienen
 * terminal físico en `terminales_portuarios`. El match por nombre de abajo
 * ya los excluiría de todos modos (no aparecen en `puertosDisponibles`),
 * pero se nombran aquí explícitamente para que la exclusión sea legible sin
 * tener que inferirla del resultado del matching.
 */
const ADUANAS_NO_PORTUARIAS = new Set(["TACNA", "DESAGUADERO", "LA TINA", "CHICLAYO", "AEREA Y POSTAL EX - IAAC", "AEREA Y POSTAL EX - IAPC"]);

function normalizeAduanaName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Alias corto → nombre completo de aduana, para los dos casos donde el
 * nombre SUNAT es compuesto ("MOLLENDO - MATARANI") o incluye un calificador
 * ("MARITIMA DEL CALLAO") que un terminal nunca repite textualmente: un
 * terminal llamado "Terminal Portuario del Callao" contiene la palabra
 * "callao" pero nunca la frase completa "maritima del callao", así que el
 * match por palabra completa contra el nombre crudo de la aduana no basta.
 */
const ALIAS_ADUANA: Readonly<Record<string, string>> = {
  callao: "MARITIMA DEL CALLAO",
  matarani: "MOLLENDO - MATARANI",
};

/**
 * Overrides verificados para terminales cuyo nombre no menciona el puerto ni
 * la bahía en absoluto — mismo patrón y mismas 9 entradas (menos las 2 de
 * San Nicolás/Huarmey, que no tienen aduana SUNAT propia) que
 * `OVERRIDES_VERIFICADOS` en cargas-portuarias-join.ts para el join con APN:
 * son terminales de la bahía administrativa del Callao (Chancay/Ventanilla/
 * Conchán incluidos) cuyo operador no incluye "Callao" en su razón social.
 * Clave = `nombre_terminal` exacto en `terminales_portuarios`.
 */
const OVERRIDES_TERMINAL_A_ADUANA: Readonly<Record<string, string>> = {
  "Multiboyas Conchán": "MARITIMA DEL CALLAO",
  "Perú LNG Melchorita": "MARITIMA DEL CALLAO",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 1)": "MARITIMA DEL CALLAO",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 2)": "MARITIMA DEL CALLAO",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 3)": "MARITIMA DEL CALLAO",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 4)": "MARITIMA DEL CALLAO",
  "Multiboyas Zeta Gas Andino": "MARITIMA DEL CALLAO",
  "Multiboyas Quimpac - Oquendo": "MARITIMA DEL CALLAO",
  "Multiboyas Sudamericana de Fibras": "MARITIMA DEL CALLAO",
  "Multiboyas TRALSA": "MARITIMA DEL CALLAO",
};

/**
 * Asocia un terminal MTC a una aduana SUNAT. Tres pasos, en orden: (1)
 * override verificado por nombre exacto de terminal, (2) alias corto
 * (callao/matarani) como palabra completa, (3) nombre crudo de la aduana
 * como palabra completa. `null` si ninguno aplica — no se fuerza un match
 * dudoso. A diferencia del join de cargas APN (que matchea "nombre de
 * puerto" contra "nombre de terminal"), aquí se matchea en la dirección
 * opuesta: dado un terminal, se busca a qué aduana pertenece.
 */
export function matchTerminalToAduana(
  nombreTerminal: string,
  labelTerminal: string | null,
  aduanasDisponibles: readonly string[]
): string | null {
  const override = OVERRIDES_TERMINAL_A_ADUANA[nombreTerminal];
  if (override && aduanasDisponibles.includes(override)) return override;

  const candidatos = [normalizeAduanaName(nombreTerminal), normalizeAduanaName(labelTerminal ?? "")];

  for (const [alias, aduanaCompleta] of Object.entries(ALIAS_ADUANA)) {
    if (!aduanasDisponibles.includes(aduanaCompleta)) continue;
    const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`);
    if (candidatos.some((c) => re.test(c))) return aduanaCompleta;
  }

  for (const aduana of aduanasDisponibles) {
    if (ADUANAS_NO_PORTUARIAS.has(aduana) || ALIAS_ADUANA_VALORES.has(aduana)) continue;
    const re = new RegExp(`\\b${escapeRegExp(normalizeAduanaName(aduana))}\\b`);
    if (candidatos.some((c) => re.test(c))) return aduana;
  }
  return null;
}

const ALIAS_ADUANA_VALORES = new Set(Object.values(ALIAS_ADUANA));

/**
 * Score normalizado 0-100 a partir de `pctValorAnomalo` — ya es una fracción
 * natural en [0,1] (OECD Handbook, método de "rescaling"), así que no hace
 * falta un bucketeo arbitrario como en volumen/variación: se multiplica
 * directo por 100.
 */
export function computeTbmlScore(aduanaScore: AduanaTbmlScore | null): number | null {
  if (aduanaScore === null) return null;
  if (aduanaScore.filasTotal === 0) return null;
  return Math.round(aduanaScore.pctValorAnomalo * 100 * 100) / 100;
}
