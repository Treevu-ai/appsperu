export type OrigenContrato = "awards" | "minor_contracts";

/** Label de UI para el campo `origen` de los crossref de CX-01 (identidad-fiscal, proveedores-sancionados). */
export const ORIGEN_CONTRATO_LABEL: Record<OrigenContrato, string> = {
  awards: "Adjudicación (OCDS)",
  minor_contracts: "Contrato menor (SEACE)",
};
