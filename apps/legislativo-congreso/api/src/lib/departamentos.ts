/**
 * Catálogo territorial peruano para el parameter `departamento` de los cruces.
 *
 * Duplicado a mano desde `apps/infobras/api/src/ingest/infobras-connector.ts`
 * (que lo usa para normalizar la ingesta). Duplicar es lo que ya hace el resto
 * del cruce entre apps —`mcp-server` no importa código de las apps y esta app
 * tampoco importa la de INFOBRAS— pero el costo de esa duplicación se paga
 * acá: sin este catálogo, `departamento` se pasaba tal cual a la query y un
 * valor no canónico devolvía 0 cruces sin error, indistinguible de un
 * departamento sin obras.
 */

/** Los 25 departamentos del Perú, en mayúsculas canónicas. */
export const PERU_DEPARTAMENTOS = [
  "AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO",
  "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE",
  "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO", "PIURA", "PUNO",
  "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI",
] as const;

export type DepartamentoCanonico = (typeof PERU_DEPARTAMENTOS)[number];

/**
 * Alias que aparecen en fuentes y no en el catálogo canónico. El XLSX nacional
 * de INFOBRAS etiqueta al Callao como "P C DEL CALLAO" (confirmado en vivo,
 * 2026-09-08, CT-06); la ingesta ya lo canonicaliza a "CALLAO", pero el
 * parámetro de la API tampoco debe aceptarlo como si fuera un departamento
 * distinto.
 */
const ALIAS_DEPARTAMENTO: Record<string, DepartamentoCanonico> = {
  "P C DEL CALLAO": "CALLAO",
  "PROVINCIA CONSTITUCIONAL DEL CALLAO": "CALLAO",
  "CALLAO PROVINCIAL": "CALLAO",
};

export const DEFAULT_DEPARTAMENTO: DepartamentoCanonico = "LA LIBERTAD";

/**
 * Normaliza el nombre del departamento: mayúsculas, espacios colapsados y
 * alias de fuente. No valida contra el catálogo; para eso, `resolverDepartamento`.
 */
export function canonicalizarDepartamento(raw: string): string {
  const limpio = raw.trim().toUpperCase().replace(/\s+/g, " ");
  return ALIAS_DEPARTAMENTO[limpio] ?? limpio;
}

/**
 * Devuelve el departamento canónico, o `null` si no está en el catálogo.
 * `null` es la señal para responder 400: es preferible rechazar un valor
 * desconocido que devolver un 0 que parece "no hay obras".
 */
export function resolverDepartamento(raw: string): DepartamentoCanonico | null {
  const canonico = canonicalizarDepartamento(raw);
  return (PERU_DEPARTAMENTOS as readonly string[]).includes(canonico)
    ? (canonico as DepartamentoCanonico)
    : null;
}
