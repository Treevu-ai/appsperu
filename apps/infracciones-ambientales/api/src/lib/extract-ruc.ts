/**
 * Duplicado a propósito de `@appsperu/shared-identity`: esta app no es
 * workspace member de npm (tiene su propio package-lock.json standalone,
 * mismo patrón que poder-judicial/ceplan-geo) — agregarla al workspace solo
 * para reusar esta función de 8 líneas es más riesgo (toca el root
 * package.json y el CI de todas las apps) que beneficio. Mismo criterio ya
 * aplicado hoy en poder-judicial con `normalizeTerritoryToken`.
 *
 * Extrae el RUC de un `supplier_id` de compras-publicas. `PE-RUC-<11
 * dígitos>` es el formato OCDS de la mayoría de proveedores (`awards`);
 * `seace:ruc:<11 dígitos>` es el usado por contratos menores
 * (`minor_contracts.winning_supplier_id`). El resto son consorcios con un id
 * interno que no es RUC estándar — devuelve `null`, nunca un valor
 * inventado.
 */
const RUC_PREFIXES = ["PE-RUC-", "seace:ruc:"] as const;

export function extractRuc(supplierId: string): string | null {
  for (const prefix of RUC_PREFIXES) {
    if (supplierId.startsWith(prefix)) {
      const ruc = supplierId.slice(prefix.length);
      return /^\d{11}$/.test(ruc) ? ruc : null;
    }
  }
  return null;
}
