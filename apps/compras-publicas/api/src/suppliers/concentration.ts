export interface SupplierShare {
  supplierId: string;
  valorTotal: number;
}

export interface ConcentrationResult {
  cr3: number;
  cr5: number;
  hhi: number;
  proveedoresConsiderados: number;
}

/**
 * CR3/CR5 (razón de concentración: % del valor total que capturan los 3/5
 * proveedores más grandes) y HHI (Índice Herfindahl-Hirschman: suma de las
 * cuotas de mercado al cuadrado, en base 10,000 — un solo proveedor con
 * 100% da HHI=10000). Fórmulas estándar de organización industrial, sin
 * librería externa. Nunca divide por cero: con valor total 0 o lista vacía
 * devuelve todo en 0 en vez de NaN.
 */
export function computeConcentration(shares: SupplierShare[]): ConcentrationResult {
  const total = shares.reduce((sum, s) => sum + s.valorTotal, 0);
  if (total <= 0 || shares.length === 0) {
    return { cr3: 0, cr5: 0, hhi: 0, proveedoresConsiderados: shares.length };
  }

  const sorted = [...shares].sort((a, b) => b.valorTotal - a.valorTotal);
  const percentages = sorted.map((s) => (s.valorTotal / total) * 100);

  const cr3 = percentages.slice(0, 3).reduce((sum, p) => sum + p, 0);
  const cr5 = percentages.slice(0, 5).reduce((sum, p) => sum + p, 0);
  const hhi = percentages.reduce((sum, p) => sum + p * p, 0);

  return {
    cr3: Math.round(cr3 * 10) / 10,
    cr5: Math.round(cr5 * 10) / 10,
    hhi: Math.round(hhi),
    proveedoresConsiderados: shares.length,
  };
}
