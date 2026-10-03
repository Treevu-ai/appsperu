/**
 * VUL-11/12: join entre el inventario MTC (`terminales_portuarios`) y el histórico de cargas
 * APN (`cargas_portuarias_historico`), para enriquecer el Índice de Vulnerabilidad Portuaria
 * con volumen de tráfico. Ver apps/infraestructura-mtc/docs/estructura-cargas-apn-2010-2017.md
 * (riesgo de nombres no normalizables) y docs/indice-vulnerabilidad-trafico-v2.md (diseño y
 * limitaciones de este join específicamente).
 *
 * IMPORTANTE: esto es un `score_vulnerabilidad` con `fuente_datos = 'MTC+CARGAS_2017'`, DISTINTO
 * del "v2" de riesgo climático (ANA SNIRH) ya implementado en vulnerabilidad-portuaria.ts
 * (`GET /vulnerabilidad/clima`). Son dos enriquecimientos independientes sobre el mismo v1, no
 * una cadena v1→v2→v3 — no combinarlos bajo el mismo nombre de versión.
 */

export interface SerieAnual {
  [anio: number]: number;
}

export type PuertoSeriesMap = ReadonlyMap<string, Readonly<SerieAnual>>;

function normalizePortName(s: string): string {
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
 * Overrides verificados manualmente contra el XLSX real (no son una suposición): cada entrada
 * corresponde a una fila de detalle confirmada en CARGAS_2010_2017.xlsx bajo el puerto indicado.
 * Se usan porque el nombre del operador en el inventario MTC 2025 no contiene el nombre del
 * puerto/bahía (ej. "Perú LNG Melchorita" no menciona "Callao"), así que el matching por
 * substring no los alcanza. Clave = `nombre_terminal` exacto en terminales_portuarios (corte 2025).
 */
const OVERRIDES_VERIFICADOS: Readonly<Record<string, string>> = {
  // San Nicolás: XLSX fila "TP Shougan Hierro Perú" (variante ortográfica de "Shougang").
  "Shougang Hierro Perú": "San Nicolás",
  // Huarmey: XLSX fila "TP Punta Lobitos - Antamina".
  "Punta Lobitos - Antamina": "Huarmey",
  // Callao (bahía administrativa APN, incluye Chancay/Ventanilla/Conchán — no solo el puerto
  // histórico): XLSX filas bajo el agregado "Callao" confirmadas una por una.
  "Multiboyas Conchán": "Callao", // XLSX: "T Multiboyas Conchán - PETROPERU"
  "Perú LNG Melchorita": "Callao", // XLSX: "TP Perú LNG Melchorita"
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 1)": "Callao", // XLSX: "T Multiboyas Refinería La Pampilla - Repsol"
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 2)": "Callao",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 3)": "Callao",
  "Refinería La Pampilla S.A.A. (Amarradero Multiboyas 4)": "Callao",
  "Multipropósito de Chancay": "Callao", // XLSX: "T Multiboyas Chancay - Blue Pacific Oils"
  "Multiboyas Blue Pacific Oils - Chancay": "Callao",
  "Multiboyas Zeta Gas Andino": "Callao", // XLSX: "T Multiboyas Zeta Gas Andino"
  "Multiboyas Quimpac - Oquendo": "Callao", // XLSX: "T Multiboyas QUIMPAC - Oquendo"
  "Multiboyas Sudamericana de Fibras": "Callao", // XLSX: "T Multiboyas Sudamericana de Fibras"
  "Multiboyas TRALSA": "Callao", // XLSX: "T Multiboyas TRALSA"
  // Chimbote: XLSX fila "Muelle SIDERPERÚ" (mismo operador, variación de mayúsculas/tilde).
  "Muelle Siderperú": "Chimbote",
  // Matarani: XLSX fila "TP Multiboyas Mollendo - Consorcio Terminales" (Mollendo es el distrito).
  "Multiboyas Mollendo": "Matarani",
  // Ilo: XLSX filas "TP Tablones - Southern Perú", "TP Tablones Marine - Southern Perú",
  // "TP Southern Perú", "TP Multiboyas TLT - TRAMARSA", "TP Enersur / ENGIE".
  "Tablones - SOUTHERN (Amarradero Multiboyas)": "Ilo",
  "Tablones - SOUTHERN (Muelle)": "Ilo",
  "Southern Perú": "Ilo",
  "Multiboyas TLT": "Ilo",
  "ENGIE": "Ilo",
};

/**
 * Intenta asociar un terminal MTC a un puerto/bahía del histórico APN. Primero revisa los
 * overrides verificados (match exacto de `nombreTerminal`); si no hay override, busca el nombre
 * del puerto como palabra completa dentro de `nombreTerminal` o `labelTerminal` normalizados.
 * Devuelve `null` si no hay evidencia de match — no se fuerza una coincidencia dudosa.
 */
export function matchTerminalToPuerto(
  nombreTerminal: string,
  labelTerminal: string | null,
  puertosDisponibles: readonly string[]
): string | null {
  const override = OVERRIDES_VERIFICADOS[nombreTerminal];
  if (override && puertosDisponibles.includes(override)) return override;

  const candidatos = [normalizePortName(nombreTerminal), normalizePortName(labelTerminal ?? "")];
  for (const puerto of puertosDisponibles) {
    const re = new RegExp(`\\b${escapeRegExp(normalizePortName(puerto))}\\b`);
    if (candidatos.some((c) => re.test(c))) return puerto;
  }
  return null;
}

/** Indexa las filas nivel='puerto' de cargas_portuarias_historico por nombre de puerto y año. */
export function buildPuertoSeriesMap(
  filas: readonly { nombreFuente: string; anio: number; volumenTm: number }[]
): PuertoSeriesMap {
  const map = new Map<string, SerieAnual>();
  for (const fila of filas) {
    const serie = map.get(fila.nombreFuente) ?? {};
    serie[fila.anio] = fila.volumenTm;
    map.set(fila.nombreFuente, serie);
  }
  return map;
}

/**
 * Score de volumen (0-75, peso 20% en la fórmula v2): más tráfico histórico = más exposición
 * (PRD-004 §1: el índice original busca exponer riesgo de lavado/contrabando/tráfico ilegal, no
 * solo abandono — a diferencia de los componentes v1, donde más alto siempre fue "peor estado").
 * Umbrales fijos en TM, derivados de los 19 puertos reales del anuario 2010-2017 (ver
 * docs/indice-vulnerabilidad-trafico-v2.md): Callao/San Nicolás caen en el tramo más alto,
 * Chicama/Puerto Maldonado/Huacho en el más bajo.
 */
export function computeVolumenScore(volumen2017: number | null): number | null {
  if (volumen2017 === null) return null;
  if (volumen2017 >= 10_000_000) return 75;
  if (volumen2017 >= 2_000_000) return 50;
  if (volumen2017 >= 200_000) return 25;
  return 10;
}

/**
 * Score de variación 2015→2017 (0-75, peso 10%): crecimiento acelerado de tráfico = más
 * exposición (terminales que crecen más rápido que la capacidad de supervisión). Un puerto sin
 * actividad en 2015 que aparece con volumen en 2017 se trata como "entra en operación" (score
 * alto) en vez de como variación infinita.
 */
export function computeVariacionScore(serie: Readonly<SerieAnual> | null): number | null {
  if (serie === null) return null;
  const v2015 = serie[2015];
  const v2017 = serie[2017];
  if (v2015 === undefined || v2017 === undefined) return null;

  if (v2015 === 0) return v2017 > 0 ? 75 : 10;

  const variacion = (v2017 - v2015) / v2015;
  if (variacion >= 0.5) return 75;
  if (variacion >= 0.15) return 50;
  if (variacion >= -0.15) return 25;
  return 10;
}
