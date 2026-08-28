/**
 * Formato confirmado en vivo el 2026-08-28 sobre
 * `docs/sintesis-la-libertad-01-2026.pdf` (BCRP Sucursal Trujillo), extraído
 * con `pdf-parse` v2 (`PDFParse.getText()`): cada ANEXO trae filas tabuladas
 * con `\t`, forma `Label \t v1 \t v2 \t ... \t v13 \t Label` (13 columnas =
 * 12 meses previos + el mes del reporte). La detección automática de tablas
 * de `pdf-parse` (`getTable()`) falló en esta página densa — se usa el
 * texto plano tabulado en su lugar.
 */

const MONTH_NAMES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MONTH_ABBREVIATIONS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];

export interface ReportPeriod {
  year: number;
  month: number; // 1-12
}

export function extractReportPeriod(pageOneText: string): ReportPeriod | null {
  const match = pageOneText.match(
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(\d{4})/i
  );
  if (!match) return null;
  const month = MONTH_NAMES[match[1].toLowerCase()];
  const year = Number(match[2]);
  if (!month || !Number.isFinite(year)) return null;
  return { year, month };
}

/**
 * 13 periodos retrocediendo desde el mes del reporte (inclusive) — las
 * columnas de cada ANEXO no distinguen año por sí solas (ENE...DIC...ENE),
 * así que se calculan por posición en vez de parsear las etiquetas.
 */
export function computeColumnPeriods(reportYear: number, reportMonth: number): ReportPeriod[] {
  const periods: ReportPeriod[] = [];
  for (let offset = 12; offset >= 0; offset--) {
    let month = reportMonth - offset;
    let year = reportYear;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    periods.push({ year, month });
  }
  return periods;
}

/**
 * "1 349" (espacio como separador de miles), "9,2" / "-44,1" (coma decimal),
 * "-" o vacío (sin dato) -> null.
 */
export function parseSoles(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text.trim();
  if (cleaned === "" || cleaned === "-") return null;
  const normalized = cleaned.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function isMonthHeaderLine(line: string): boolean {
  const upper = line.toUpperCase();
  return MONTH_ABBREVIATIONS.filter((m) => upper.includes(m)).length >= 6;
}

function isBoilerplateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^\d+\/\s/.test(trimmed)) return true; // notas al pie "1/ Cifras preliminares..."
  if (/^(Fuente|Elaboración|Elaboracion)\s*:/i.test(trimmed)) return true;
  if (/^ANEXO\b/i.test(trimmed)) return true;
  if (/^Síntesis de Actividad Económica/i.test(trimmed)) return true;
  if (/^LA LIBERTAD:/i.test(trimmed)) return true;
  if (/^\(.*\)$/.test(trimmed)) return true; // línea de unidad "(TM)", "(En millones de soles)"
  if (/^-- \d+ of \d+ --$/.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true; // número de página suelto
  return false;
}

export interface NormalizedIndicatorRow {
  seccion: string | null;
  indicador: string;
  values: (number | null)[]; // 13 valores, alineados con columnPeriods
}

/**
 * Parsea el texto de un ANEXO (ya recortado por `splitByAnexo`) a filas de
 * indicador × 13 valores. Líneas sin 13 valores numéricos válidos junto al
 * label repetido al final no se consideran filas de datos — si no matchean
 * ningún patrón conocido (boilerplate, encabezado de mes) se tratan como
 * posible encabezado de sección (heurística best-effort, ver ADR-0014).
 */
/**
 * Etiquetas que se repiten como sub-fila bajo varias categorías padre en el
 * mismo anexo (confirmado en ANEXO 10: "Gobierno nacional" aparece 6 veces,
 * una por cada categoría de gasto — Gastos Corrientes, Remuneraciones,
 * Bienes y Servicios, Transferencias, Formación Bruta de Capital, Gasto No
 * Financiero Total). El texto extraído no preserva indentación, así que la
 * jerarquía se reconstruye por orden secuencial: cuando aparece una de estas
 * etiquetas, se le asigna como `seccion` la última fila de datos que *no*
 * fue una de estas etiquetas (su categoría padre inmediata).
 */
const REPEATED_SUBROW_LABELS = /^gobiernos?\s+(nacional|regional|locales)$/i;

export function parseAnexoTable(sectionText: string): NormalizedIndicatorRow[] {
  const rows: NormalizedIndicatorRow[] = [];
  let currentHeading: string | null = null; // encabezado sin datos, ej. "AGRÍCOLA"
  let currentDataParent: string | null = null; // última fila de datos no repetida, ej. "I. GASTOS CORRIENTES"

  const lines = sectionText.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    if (isMonthHeaderLine(line)) continue;
    if (isBoilerplateLine(line)) continue;

    const fields = line.split("\t").map((f) => f.trim());
    if (fields.length >= 14) {
      const label = fields[0];
      const values = fields.slice(1, 14).map(parseSoles);
      const numericCount = values.filter((v) => v !== null).length;
      if (label && numericCount >= 10) {
        const isRepeatedSubrow = REPEATED_SUBROW_LABELS.test(label);
        const seccion = isRepeatedSubrow ? currentDataParent ?? currentHeading : currentHeading;
        rows.push({ seccion, indicador: label, values });
        if (!isRepeatedSubrow) currentDataParent = label;
        continue;
      }
    }

    // No es una fila de datos válida: candidato a encabezado de sección
    // (p.ej. "AGRÍCOLA", "PECUARIO") si no tiene tabs ni dígitos.
    if (!line.includes("\t") && !/\d/.test(line) && line.trim().length < 60) {
      currentHeading = line.trim();
    }
  }

  return rows;
}

const ANEXO_HEADER_RE = /ANEXO\s*(?:N[°ºo]\.?)?\s*(\d+)/gi;

/**
 * Parte el texto completo del PDF en la posición de cada encabezado
 * `ANEXO N` (formatos vistos: "ANEXO 1", "ANEXO Nº 01", "ANEXO N° 10"),
 * hasta el siguiente ANEXO o el fin del documento.
 */
export function splitByAnexo(fullText: string): Map<number, string> {
  const matches = [...fullText.matchAll(ANEXO_HEADER_RE)];
  const sections = new Map<number, string>();

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const anexoNumero = Number(match[1]);
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : fullText.length;
    if (!sections.has(anexoNumero)) {
      sections.set(anexoNumero, fullText.slice(start, end));
    }
  }

  return sections;
}

export interface NormalizedIngestRow {
  anexoNumero: number;
  seccion: string | null;
  indicador: string;
  periodoAnio: number;
  periodoMes: number;
  valor: number | null;
}

export function toIngestRows(
  anexoNumero: number,
  rows: NormalizedIndicatorRow[],
  columnPeriods: ReportPeriod[]
): NormalizedIngestRow[] {
  const out: NormalizedIngestRow[] = [];
  for (const row of rows) {
    for (let i = 0; i < columnPeriods.length; i++) {
      const period = columnPeriods[i];
      out.push({
        anexoNumero,
        seccion: row.seccion,
        indicador: row.indicador,
        periodoAnio: period.year,
        periodoMes: period.month,
        valor: row.values[i] ?? null,
      });
    }
  }
  return out;
}
