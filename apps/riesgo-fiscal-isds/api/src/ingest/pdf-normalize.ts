export interface ParsedRow {
  anio: number;
  categoria: "total" | "judicial_administrativo" | "isds" | "app";
  pctPbi: number;
}

// .*? no codicioso: con .* codicioso sin ancla fija al final (caso de
// JUDICIAL_LINE, que no tiene un literal corto como "CIADI"/"APP" para
// detener el backtracking), el grupo de captura solo agarraba el ÚLTIMO
// valor de la fila en vez de los N completos — bug real encontrado en el
// spike, ver docs/adr/0023.
const ISDS_LINE = /^2\.\s*Controversias internacionales.*?CIADI\s*\t(.+)$/im;
const JUDICIAL_LINE = /^1\.\s*Procesos judiciales.*?\t(.+)$/im;
const APP_LINE = /^3\.\s*Contingencias expl[ií]citas asumid.*?APP\s*\t(.+)$/im;
const TOTAL_LINE = /^Total\s*\t(.+)$/im;
const YEARS_HEADER = /^((?:\b20\d{2}\b(?!\/)\s*\t\s*){1,7}\b20\d{2}\b(?!\/))\s*$/m;

function numbersOf(line: string): number[] {
  return [...line.matchAll(/(\d+,\d+)/g)].map((m) => Number(m[1].replace(",", ".")));
}

/**
 * Parsea la tabla "Tipo de contingencia fiscal explícita — Exposición Máxima
 * (EM)" del Recuadro de Pasivos Contingentes Explícitos del SPNF, formato
 * confirmado en IAPM_2025_2028 (spike técnico, ver docs/adr/0023): un
 * encabezado de N años, seguido de filas "Total", "1. Procesos
 * judiciales...", "2. Controversias internacionales... CIADI", "3.
 * Contingencias explícitas... APP", cada una con N valores tab-separados en
 * formato "12,70" (coma decimal).
 *
 * Estrategia anti-falso-positivo (encontrado en el spike: anclar por texto
 * de caption cercano no funciona — pdf-parse extrae los recuadros del PDF
 * en un orden que no siempre coincide con el orden visual, así que una
 * etiqueta que en la página aparece "antes" de la tabla puede salir
 * "después" en el texto extraído): en vez de anclar por caption, se busca
 * la línea "2. Controversias internacionales... CIADI" — un string lo
 * bastante específico como para no repetirse por azar — en TODAS sus
 * apariciones del documento, y para cada una se intenta reconstruir la
 * tabla completa en una ventana acotada alrededor (±800 caracteres). Si no
 * se encuentran las otras 3 filas y el encabezado de años con el MISMO
 * número de columnas en esa ventana, se descarta esa aparición y se prueba
 * la siguiente — nunca se devuelve una tabla parcial. Esto es lo que
 * descarta automáticamente el formato distinto de MMM_2024_2027 (esa
 * edición tiene una tabla con columnas "año actual + año previo +
 * Contingencia Esperada + Diferencia", no una serie de años) sin necesidad
 * de un caso especial por edición.
 */
export function parsePasivosContingentesTable(text: string): ParsedRow[] {
  const isdsMatches = [...text.matchAll(new RegExp(ISDS_LINE.source, "gim"))];

  for (const isdsMatch of isdsMatches) {
    const idx = isdsMatch.index ?? 0;
    const windowStart = Math.max(0, idx - 800);
    const windowEnd = Math.min(text.length, idx + 800);
    const window = text.slice(windowStart, windowEnd);

    const headerMatch = YEARS_HEADER.exec(window);
    const totalMatch = TOTAL_LINE.exec(window);
    const judicialMatch = JUDICIAL_LINE.exec(window);
    const appMatch = APP_LINE.exec(window);
    if (!headerMatch || !totalMatch || !judicialMatch || !appMatch) continue;

    const years = headerMatch[1]
      .split("\t")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);

    const perCategory: { categoria: ParsedRow["categoria"]; numbers: number[] }[] = [
      { categoria: "total", numbers: numbersOf(totalMatch[1]) },
      { categoria: "judicial_administrativo", numbers: numbersOf(judicialMatch[1]) },
      { categoria: "isds", numbers: numbersOf(isdsMatch[1]) },
      { categoria: "app", numbers: numbersOf(appMatch[1]) },
    ];

    const allComplete = perCategory.every((c) => c.numbers.length === years.length);
    if (!allComplete) continue;

    const rows: ParsedRow[] = [];
    for (const { categoria, numbers } of perCategory) {
      years.forEach((anio, i) => rows.push({ anio, categoria, pctPbi: numbers[i] }));
    }
    return rows;
  }

  return [];
}
