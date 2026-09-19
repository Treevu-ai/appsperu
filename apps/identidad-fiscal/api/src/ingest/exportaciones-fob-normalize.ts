import * as cheerio from "cheerio";

/**
 * Parser de la respuesta HTML de "Consulta por Importador/Exportador" de
 * Aduanas-SUNAT (aduanet.gob.pe/cl-ad-itconsultadwh/ieITS01Alias). El HTML
 * es de un sistema legado (encoding windows-1252, campos de ancho fijo
 * rellenados con bytes nulos \x00) — se recibe ya decodificado como latin1
 * (equivalente para los caracteres que aparecen en esta fuente).
 *
 * Cada fila de la tabla trae, además del texto visible, los códigos reales
 * (aduana/agente/mes/año/país) embebidos en el atributo `onclick`/`href` del
 * link "LISTAR" (llamada a `jsDetalleDUA(...)`) — se usan esos códigos en
 * vez de parsear el texto porque son estables y no dependen del idioma/
 * formato de fecha.
 */

export interface ExportacionFobRow {
  ruc: string;
  anio: number;
  mes: number;
  aduanaCodigo: string;
  aduanaNombre: string | null;
  agenteCodigo: string;
  agenteNombre: string | null;
  paisCodigo: string;
  paisNombre: string | null;
  fobUsd: number;
}

function cleanText(raw: string): string {
  return raw.replace(/\x00/g, "").replace(/\s+/g, " ").trim();
}

function parseFob(raw: string): number | null {
  const cleaned = cleanText(raw).replace(/,/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * `html` es la respuesta ya decodificada (latin1) de
 * `accion=buscarListadoImpoExpo`. Devuelve [] si la fuente dice "No se
 * encontraron registros..." (RUC sin exportaciones en el período pedido) —
 * no es un error, es un resultado válido.
 */
export function parseExportacionesFobHtml(html: string): ExportacionFobRow[] {
  const $ = cheerio.load(html);
  const rows: ExportacionFobRow[] = [];

  $("tr.bg").each((_, el) => {
    const cells = $(el).find("td");
    if (cells.length < 7) return;

    const onclickAttr = $(cells[0]).find("a").attr("href") ?? "";
    const match = onclickAttr.match(
      /jsDetalleDUA\("(\d+)","(\d+)","(\d+)","(\d+)","(\d+)","(\d+)","([A-Za-z]{2})"\)/
    );
    if (!match) return;

    const [, , tipNroDoc, codAduana, codAgente, codMes, codAnio, codPais] = match;
    const ruc = tipNroDoc.slice(-11);

    const agenteNombre = cleanText($(cells[3]).text()) || null;
    const aduanaNombre = cleanText($(cells[4]).text()) || null;
    const paisNombre = cleanText($(cells[5]).text()) || null;
    const fobUsd = parseFob($(cells[6]).text());
    if (fobUsd === null) return;

    rows.push({
      ruc,
      anio: Number(codAnio),
      mes: Number(codMes),
      aduanaCodigo: codAduana,
      aduanaNombre,
      agenteCodigo: codAgente,
      agenteNombre,
      paisCodigo: codPais.toUpperCase(),
      paisNombre,
      fobUsd,
    });
  });

  return rows;
}
