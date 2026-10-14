/**
 * Parser puro de una fila `<row>` de la hoja de un `.xlsx`. No depende de ZIP ni
 * de la librería `xlsx`, así que se testea con el XML real capturado de los
 * archivos de MINCETUR.
 *
 * Estos archivos usan `t="inlineStr"` (no hay `sharedStrings.xml` — verificado:
 * el ZIP tiene 9 entradas y ninguna es sharedStrings). Igual se contempla `t="s"`
 * para fallar con un mensaje claro en vez de devolver basura si alguna fuente
 * futura sí usa cadenas compartidas.
 */
const CELDA_RE =
  /<c r="([A-Z]+)\d+"([^>]*)>(?:<is><t(?:\s[^>]*)?>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)?<\/c>/g;

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

export function decodificarXml(raw: string): string {
  return raw.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m] ?? m);
}

/**
 * Devuelve los valores de la fila en orden de columna. Una celda vacía o sin
 * valor se devuelve como `""`. Si la fila trae menos celdas que el encabezado,
 * el consumidor debe descartarla (`normalizarFila` lo hace).
 */
export function parseRowCells(rowXml: string): string[] {
  const celdas: Array<{ col: string; valor: string }> = [];
  let m: RegExpExecArray | null;
  CELDA_RE.lastIndex = 0;
  while ((m = CELDA_RE.exec(rowXml)) !== null) {
    const [, col, attrs, inline, v] = m;
    if (/\bt="s"/.test(attrs)) {
      throw new Error("Fila con celdas t=\"s\" (sharedStrings): formato no soportado por este parser.");
    }
    const valor = inline !== undefined ? decodificarXml(inline) : v !== undefined ? decodificarXml(v) : "";
    celdas.push({ col, valor });
  }
  // Ordenar por índice de columna: el orden de aparición ya es el orden lógico,
  // pero si una fila tiene celdas salteadas esto lo hace explícito.
  celdas.sort((a, b) => a.col.localeCompare(b.col));
  return celdas.map((c) => c.valor);
}
