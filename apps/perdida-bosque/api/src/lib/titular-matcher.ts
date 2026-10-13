/**
 * Match de nombres de titular/empresa por tokens (Jaccard sobre palabras
 * normalizadas), no por igualdad exacta -- SERFOR/OSINFOR no comparten un
 * identificador estable entre sus propios sistemas (confirmado en vivo:
 * un mismo cont_id tuvo "MADERERA LAZO S.R.LTDA." en forest_concessions y
 * "MADERERA REY EIRL" en la sancion, sin relacion real entre las dos
 * empresas -- ese caso NO debe matchear).
 *
 * LIMITACIÓN CONOCIDA: este matcher no corrige errores de tipeo dentro de
 * una misma palabra (ej. "JOREGE" vs "JORGE") -- un caso real encontrado en
 * vivo ("MADERERA SAN JOREGE E.I.R.L TDA" vs "MADERERA SAN JORGE
 * E.I.R.LTDA.") fue marcado como NO coincidente por este matcher pese a ser
 * casi seguro la misma empresa con una errata. Reportar explícitamente como
 * "discrepancia" en vez de asumir el match evita falsos positivos (atribuir
 * una sanción a la empresa equivocada), al costo de algún falso negativo
 * como este -- revisar manualmente las discrepancias con similitud visual
 * alta antes de descartarlas.
 */

/** Quita sufijos societarios comunes (abreviados y escritos completos) y normaliza para comparar nombres. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes/diéresis (á->a, ñ->n via descomposición NFD)
    .toUpperCase()
    .replace(/['".]/g, "")
    .replace(
      /\b(SOCIEDAD ANONIMA CERRADA|SOCIEDAD ANONIMA|SOCIEDAD COMERCIAL DE RESPONSABILIDAD LIMITADA|SOCIEDAD DE RESPONSABILIDAD LIMITADA|EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA|S\.?A\.?C\.?|S\.?R\.?L\.?|S\.?R\.?LTDA\.?|E\.?I\.?R\.?L\.?|S\.?A\.?|LTDA\.?|SAC|SRL|EIRL)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function coincideTitular(company: string, titular: string): boolean {
  const a = new Set(normalizarNombre(company).split(" ").filter((w) => w.length > 2));
  const b = new Set(normalizarNombre(titular).split(" ").filter((w) => w.length > 2));
  if (a.size === 0 || b.size === 0) return false;
  const interseccion = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return interseccion / union >= 0.5;
}
