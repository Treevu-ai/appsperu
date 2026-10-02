import type { Cobertura } from "../lib/types.js";

const COLORS: Record<Cobertura, string> = {
  COMPLETA: "bg-accent/10 text-accent border-accent/30",
  PARCIAL: "bg-warn/10 text-warn border-warn/30",
  BLOQUEADA: "bg-danger/10 text-danger border-danger/30",
  NO_APLICA: "bg-ink-800 text-muted border-line",
};

/**
 * Badge explícito para el estado de cobertura de una respuesta de la API.
 * P1 (vacío de evidencia, no conclusión) — la UI NUNCA debe mostrar un
 * spinner ni una celda vacía cuando la cobertura es PARCIAL o BLOQUEADA.
 */
export function CoverageBadge({ cobertura, label }: { cobertura: Cobertura; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono uppercase ${COLORS[cobertura]}`}>
      {label ?? cobertura}
    </span>
  );
}
