export type OeceOcidReconciliationStatus = "matched_exact_ocid" | "release_only" | "record_only";

/**
 * Regla deliberadamente estricta: una adjudicación y una convocatoria sólo
 * quedan enlazadas si comparten el mismo OCID OCDS. No hay matching difuso.
 */
export function classifyOcidReconciliation(releasePresent: boolean, awardPresent: boolean): OeceOcidReconciliationStatus {
  if (releasePresent && awardPresent) return "matched_exact_ocid";
  if (releasePresent) return "release_only";
  if (awardPresent) return "record_only";
  throw new Error("Una conciliación OECE requiere al menos una fuente presente.");
}
