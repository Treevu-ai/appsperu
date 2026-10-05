/**
 * Columnas B→Q confirmadas en vivo el 2026-08-28 sobre el XLSX real de
 * `investmentpromotionExport.php` (fila de cabecera real en r="10", no la
 * primera fila del sheet — hay filas de título/metadata antes).
 */
export const OXI_COLUMNS = {
  id: "B", // "N°"
  fase: "C",
  tipoInversion: "D",
  nivelEstudio: "E",
  nivelGobierno: "F",
  departamento: "G",
  provincia: "H",
  distrito: "I",
  entidad: "J",
  linkWeb: "K",
  codigoReferencia: "L", // "CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA" — mezcla 3 sistemas de código
  nombreProyecto: "M",
  funcion: "N",
  tipologia: "O",
  montoInversionReferencial: "P",
  rangoMonto: "Q",
} as const;

export type OxiRawRow = Partial<Record<string, string>>;

export interface NormalizedOxiRow {
  oxiId: number;
  fase: string | null;
  tipoInversion: string | null;
  nivelEstudio: string | null;
  nivelGobierno: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  /**
   * `false` cuando `provincia` no pasa la validación de DQ-18 (ver
   * `provinciaEsConfiable`). Mismo patrón que `distrito_sospechoso` de
   * INFOBRAS: marca, nunca corrige en silencio ni descarta la fila.
   */
  provinciaConfiable: boolean;
  /**
   * Provincia recuperada de `nombreProyecto` por regex, solo cuando
   * `provinciaConfiable` es `false` — nunca sustituye al campo estructurado,
   * se expone aparte para que el consumidor decida si confiar en el fallback.
   */
  provinciaExtraidaDeNombre: string | null;
  /** Mismo criterio que `provinciaExtraidaDeNombre`, para `distrito`. */
  distritoExtraidoDeNombre: string | null;
  entidad: string | null;
  codigoReferencia: string | null;
  nombreProyecto: string;
  funcion: string | null;
  tipologia: string | null;
  montoInversionReferencial: number | null;
  rangoMonto: string | null;
}

/**
 * DQ-18: la fuente trae `provincia` puramente numérica en vez de un nombre de
 * provincia real. No es un ubigeo: la misma fila (`oxi_id 5346`) cambió de
 * `provincia "469"` a `"478"` al re-descargar 3 días después, y el valor
 * `"478"` se repite en la misma descarga entre Pacasmayo, Sánchez Carrión,
 * Virú y Santiago de Chuco — provincias reales distintas. Verificado en vivo
 * 2026-10-05: el patrón es nacional, 78/711 proyectos (11%) en 20 de los 25
 * departamentos — no un caso aislado de La Libertad, contra lo documentado
 * originalmente en DQ-18.
 */
export function provinciaEsConfiable(provincia: string | null): boolean {
  if (!provincia) return false;
  return !/^\d+$/.test(provincia);
}

/**
 * Recupera distrito/provincia/departamento de `nombreProyecto` cuando el
 * campo estructurado no es confiable. El dataset nacional de INVIERTE.PE
 * nombra sus proyectos con el patrón "...DISTRITO DE <d> - PROVINCIA [DE]
 * <p> - DEPARTAMENTO [DE] <dep>" (separador "-" o ","; "DE" opcional antes de
 * provincia/departamento, siempre presente antes de distrito) — verificado
 * en vivo sobre las 78 filas de `provincia` no confiable a nivel nacional.
 *
 * Deliberadamente estricto: exige el patrón completo anclado al final del
 * texto. Frases con otra gramática (ej. "...DE LA PROVINCIA DE LA MAR DEL
 * DEPARTAMENTO DE AYACUCHO", sin separador antes de "PROVINCIA") no
 * matchean y devuelven `null` — es preferible no extraer nada a adivinar mal
 * el límite entre distrito y provincia.
 */
const PATRON_UBICACION_NOMBRE_PROYECTO =
  /DISTRITO\s+DE\s+([^,\-]+?)\s*[-,]\s*PROVINCIA\s+(?:DE\s+)?([^,\-]+?)\s*[-,]\s*DEPARTAMENTO\s+(?:DE\s+)?([^,\-.]+?)[.\s]*$/i;

export interface UbicacionExtraida {
  distrito: string;
  provincia: string;
  departamento: string;
}

export function extraerUbicacionDeNombreProyecto(nombreProyecto: string): UbicacionExtraida | null {
  const match = nombreProyecto.match(PATRON_UBICACION_NOMBRE_PROYECTO);
  if (!match) return null;
  const [, distrito, provincia, departamento] = match;
  return {
    distrito: distrito.trim().toUpperCase(),
    provincia: provincia.trim().toUpperCase(),
    departamento: departamento.trim().toUpperCase(),
  };
}

/**
 * Convierte `"S/443,431.09"` (o variantes con espacios) a `443431.09`.
 * Los montos OxI vienen en soles — moneda distinta a `montoInversionSigv`
 * (dólares) de la cartera APP/PA VERTIX; no se deben sumar entre sí.
 */
export function parseOxiMontoSoles(text: string | undefined | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/S\/\.?/gi, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Normaliza una fila cruda (columna → texto de celda). Devuelve `null` para
 * filas que no son datos reales (título, metadata "Nº Registros: NNN", fila
 * vacía final) — todas identificables porque no traen un `N°` numérico en
 * la columna B.
 */
export function parseOxiRow(cells: OxiRawRow): NormalizedOxiRow | null {
  const idRaw = cells[OXI_COLUMNS.id]?.trim();
  if (!idRaw || !/^\d+$/.test(idRaw)) return null;

  const nombreProyecto = cells[OXI_COLUMNS.nombreProyecto]?.trim();
  if (!nombreProyecto) return null;

  const provincia = trimOrNull(cells[OXI_COLUMNS.provincia]);
  const provinciaConfiable = provinciaEsConfiable(provincia);
  // Solo se intenta el fallback cuando el estructurado no es confiable: si
  // provincia ya es un nombre real, extraer de nombreProyecto no aporta y
  // arriesga divergir del campo estructurado sin motivo.
  const ubicacionExtraida = provinciaConfiable ? null : extraerUbicacionDeNombreProyecto(nombreProyecto);

  return {
    oxiId: Number(idRaw),
    fase: trimOrNull(cells[OXI_COLUMNS.fase]),
    tipoInversion: trimOrNull(cells[OXI_COLUMNS.tipoInversion]),
    nivelEstudio: trimOrNull(cells[OXI_COLUMNS.nivelEstudio]),
    nivelGobierno: trimOrNull(cells[OXI_COLUMNS.nivelGobierno]),
    departamento: trimOrNull(cells[OXI_COLUMNS.departamento]),
    provincia,
    distrito: trimOrNull(cells[OXI_COLUMNS.distrito]),
    provinciaConfiable,
    provinciaExtraidaDeNombre: ubicacionExtraida?.provincia ?? null,
    distritoExtraidoDeNombre: ubicacionExtraida?.distrito ?? null,
    entidad: trimOrNull(cells[OXI_COLUMNS.entidad]),
    codigoReferencia: trimOrNull(cells[OXI_COLUMNS.codigoReferencia]),
    nombreProyecto,
    funcion: trimOrNull(cells[OXI_COLUMNS.funcion]),
    tipologia: trimOrNull(cells[OXI_COLUMNS.tipologia]),
    montoInversionReferencial: parseOxiMontoSoles(cells[OXI_COLUMNS.montoInversionReferencial]),
    rangoMonto: trimOrNull(cells[OXI_COLUMNS.rangoMonto]),
  };
}
