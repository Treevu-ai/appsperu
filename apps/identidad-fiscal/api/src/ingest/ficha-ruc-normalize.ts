/**
 * Parser de la ficha individual de RUC (e-consultaruc.sunat.gob.pe), a
 * partir del texto plano de la página de resultado (mismo formato que
 * devuelve `body.innerText` — etiqueta en una línea, valor en la(s)
 * siguiente(s), confirmado en vivo el 2026-09-18 contra RUC 20129156083 y
 * 20404057805). No hay estructura de columnas fiable en texto plano para
 * la sección principal — funciona porque cada campo es "Etiqueta:" seguida
 * de su valor, sin ambigüedad de dónde empieza el siguiente campo mientras
 * se ancle por las etiquetas conocidas, no por posición de línea fija (la
 * fuente real intercala líneas en blanco de forma inconsistente entre
 * etiqueta y valor).
 */

const FIELD_LABELS = [
  "Tipo Contribuyente:",
  "Nombre Comercial:",
  "Fecha de Inscripción:",
  "Fecha de Inicio de Actividades:",
  "Estado del Contribuyente:",
  "Condición del Contribuyente:",
  "Domicilio Fiscal:",
  "Sistema Emisión de Comprobante:",
  "Actividad Comercio Exterior:",
  "Sistema Contabilidad:",
  "Actividad(es) Económica(s):",
  "Comprobantes de Pago c/aut. de impresión (F. 806 u 816):",
  "Sistema de Emisión Electrónica:",
  "Emisor electrónico desde:",
  "Comprobantes Electrónicos:",
  "Afiliado al PLE desde:",
  "Padrones:",
  "Fecha consulta:",
] as const;

export interface ParsedActividad {
  orden: number;
  tipo: "PRINCIPAL" | "SECUNDARIA";
  codigoCiiu: string | null;
  descripcion: string;
}

export interface ParsedFichaRuc {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  tipoContribuyente: string | null;
  fechaInscripcion: string | null; // YYYY-MM-DD
  fechaInicioActividades: string | null;
  estadoContribuyente: string | null;
  condicionContribuyente: string | null;
  domicilioFiscal: string | null;
  sistemaEmisionComprobante: string | null;
  actividadComercioExterior: string | null;
  sistemaContabilidad: string | null;
  comprobantesPago: string[];
  sistemaEmisionElectronica: string[];
  emisorElectronicoDesde: string | null;
  comprobantesElectronicos: string | null;
  afiliadoPleDesde: string | null;
  padrones: string[];
  actividades: ParsedActividad[];
}

export interface RejectedFicha {
  raw: string;
  reason: string;
}

function isRejectedFicha(row: ParsedFichaRuc | RejectedFicha): row is RejectedFicha {
  return "reason" in row;
}

function parseFechaDDMMYYYY(value: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/** Extrae, para cada etiqueta conocida, todo el texto hasta la siguiente etiqueta (o el final). */
function extractBlocks(text: string): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  const positions = FIELD_LABELS.map((label) => ({ label, index: text.indexOf(label) })).filter(
    (p) => p.index !== -1
  );
  positions.sort((a, b) => a.index - b.index);

  for (let i = 0; i < positions.length; i += 1) {
    const { label, index } = positions[i];
    const start = index + label.length;
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
    const lines = text
      .slice(start, end)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    blocks.set(label, lines);
  }
  return blocks;
}

const ACTIVIDAD_LINE = /^(Principal|Secundaria \d+)\s*-\s*(\d+)\s*-\s*(.+)$/;

function parseActividades(lines: string[]): ParsedActividad[] {
  const actividades: ParsedActividad[] = [];
  lines.forEach((line, i) => {
    const match = line.match(ACTIVIDAD_LINE);
    if (!match) return;
    const [, etiqueta, codigo, descripcion] = match;
    actividades.push({
      orden: i + 1,
      tipo: etiqueta.startsWith("Principal") ? "PRINCIPAL" : "SECUNDARIA",
      codigoCiiu: codigo,
      descripcion: descripcion.trim(),
    });
  });
  return actividades;
}

function firstOrNull(lines: string[] | undefined): string | null {
  return lines && lines.length > 0 ? lines[0] : null;
}

/**
 * `rawText` es el `body.innerText` de la página de resultado de
 * `e-consultaruc.sunat.gob.pe` tras buscar por RUC.
 */
export function parseFichaRuc(rawText: string): ParsedFichaRuc | RejectedFicha {
  const rucLineMatch = rawText.match(/Número de RUC:\s*\n?\s*(\d{11})\s*-\s*(.+)/);
  if (!rucLineMatch) {
    return { raw: rawText, reason: "no se encontró la línea 'Número de RUC: <ruc> - <razón social>'" };
  }
  const [, ruc, razonSocial] = rucLineMatch;

  const blocks = extractBlocks(rawText);

  return {
    ruc,
    razonSocial: razonSocial.trim(),
    nombreComercial: firstOrNull(blocks.get("Nombre Comercial:")),
    tipoContribuyente: firstOrNull(blocks.get("Tipo Contribuyente:")),
    fechaInscripcion: parseFechaDDMMYYYY(firstOrNull(blocks.get("Fecha de Inscripción:"))),
    fechaInicioActividades: parseFechaDDMMYYYY(firstOrNull(blocks.get("Fecha de Inicio de Actividades:"))),
    estadoContribuyente: firstOrNull(blocks.get("Estado del Contribuyente:")),
    condicionContribuyente: firstOrNull(blocks.get("Condición del Contribuyente:")),
    domicilioFiscal: firstOrNull(blocks.get("Domicilio Fiscal:")),
    sistemaEmisionComprobante: firstOrNull(blocks.get("Sistema Emisión de Comprobante:")),
    actividadComercioExterior: firstOrNull(blocks.get("Actividad Comercio Exterior:")),
    sistemaContabilidad: firstOrNull(blocks.get("Sistema Contabilidad:")),
    comprobantesPago: blocks.get("Comprobantes de Pago c/aut. de impresión (F. 806 u 816):") ?? [],
    sistemaEmisionElectronica: blocks.get("Sistema de Emisión Electrónica:") ?? [],
    emisorElectronicoDesde: parseFechaDDMMYYYY(firstOrNull(blocks.get("Emisor electrónico desde:"))),
    comprobantesElectronicos: firstOrNull(blocks.get("Comprobantes Electrónicos:")),
    afiliadoPleDesde: parseFechaDDMMYYYY(firstOrNull(blocks.get("Afiliado al PLE desde:"))),
    padrones: (blocks.get("Padrones:") ?? []).filter((l) => l !== "NINGUNO"),
    actividades: parseActividades(blocks.get("Actividad(es) Económica(s):") ?? []),
  };
}

export { isRejectedFicha };

/**
 * Cargos conocidos de representante legal en el RUC peruano (SUNAT) — lista
 * cerrada y razonablemente estable (terminología societaria estándar), no
 * inventada por fila. Se usa para separar "NOMBRE CARGO" en texto plano de
 * tabla, que no trae un delimitador propio entre ambos campos. Si el texto
 * no termina en ninguno de estos cargos conocidos, se conserva completo en
 * `nombre` y `cargo` queda `null` — no se adivina un corte arbitrario.
 */
const CARGOS_CONOCIDOS = [
  "GERENTE GENERAL",
  "GERENTE",
  "PRESIDENTE",
  "VICEPRESIDENTE",
  "APODERADO",
  "REPRESENTANTE LEGAL",
  "DIRECTOR GERENTE",
  "SOCIO GERENTE",
  "ADMINISTRADOR",
  "TITULAR GERENTE",
] as const;

export interface ParsedRepresentante {
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  nombre: string;
  cargo: string | null;
  fechaDesde: string | null;
}

/**
 * `rawText` es el `body.innerText` de la sub-página "Representante(s)
 * Legal(es)". Formato real confirmado (una fila): "DNI 28703600 OCHOA RUA
 * TIMOTEO GERENTE GENERAL 23/02/2023" — tipo/número de documento al inicio,
 * fecha al final, nombre+cargo en medio sin separador propio.
 */
export function parseRepresentantes(rawText: string): ParsedRepresentante[] {
  const lines = rawText.split("\n").map((l) => l.trim());
  const dataLines = lines.filter((l) => /^(DNI|CE|PAS|RUC)\s+\S+/.test(l));

  return dataLines.map((line) => {
    const match = line.match(/^(\S+)\s+(\S+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})$/);
    if (!match) {
      return { tipoDocumento: null, numeroDocumento: null, nombre: line, cargo: null, fechaDesde: null };
    }
    const [, tipoDocumento, numeroDocumento, nombreCargo, fecha] = match;

    const cargoEncontrado = CARGOS_CONOCIDOS.find((cargo) => nombreCargo.endsWith(cargo));
    const nombre = cargoEncontrado ? nombreCargo.slice(0, -cargoEncontrado.length).trim() : nombreCargo.trim();
    const cargo = cargoEncontrado ?? null;

    return {
      tipoDocumento,
      numeroDocumento,
      nombre,
      cargo,
      fechaDesde: parseFechaDDMMYYYY(fecha),
    };
  });
}
