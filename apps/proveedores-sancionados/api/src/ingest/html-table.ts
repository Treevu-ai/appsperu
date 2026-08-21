/**
 * Parser genérico del HTML-como-.xls que expone el export real de
 * RNP/OECE (ver docs/data-contracts/proveedores-sancionados.md). No es XML
 * estricto (mezcla mayúsculas/minúsculas en las etiquetas, sin cerrar
 * algunas), así que se parsea con regex tolerante, no un parser XML — mismo
 * criterio que ya se usó para el sheet de INFOBRAS, que tampoco era XML
 * bien formado.
 */

const ROW_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_TEXT_RE = /<font[^>]*>([\s\S]*?)<\/font>/gi;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " — ") // celdas de infracción real traen <br> real dentro del texto, no solo entre celdas
    .replace(/&nbsp;/gi, " ")
    .replace(/&oacute;/gi, "ó")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrae, por cada `<tr>`, el texto de cada celda con contenido dentro de
 * `<font>` (así viene formateado el reporte real — celdas vacías sin
 * `<font>` no producen entrada, igual que en el HTML de origen).
 */
export function parseHtmlRows(html: string): string[][] {
  const rows: string[][] = [];
  let rowMatch: RegExpExecArray | null;
  ROW_RE.lastIndex = 0;

  while ((rowMatch = ROW_RE.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    CELL_TEXT_RE.lastIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = CELL_TEXT_RE.exec(rowHtml)) !== null) {
      cells.push(decodeHtmlEntities(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}
