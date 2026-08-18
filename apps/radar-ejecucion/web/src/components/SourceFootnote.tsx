import { formatFecha } from "@/lib/format";

export interface SourceFootnoteProps {
  dataset: string;
  resourceId: string;
  fechaCorte: string;
  extraidoEl?: string;
  metodologiaHref?: string;
}

/**
 * Único componente que renderiza el rastro de evidencia (fuente, fecha de corte,
 * metodología). Se reutiliza en las 3 vistas para no duplicar el patrón de
 * trazabilidad que exige el documento fuente.
 */
export function SourceFootnote({
  dataset,
  resourceId,
  fechaCorte,
  extraidoEl,
  metodologiaHref,
}: SourceFootnoteProps) {
  return (
    <footer className="source-footnote" data-testid="source-footnote">
      <span>
        Fuente: <strong>{dataset}</strong> (recurso {resourceId})
      </span>
      <span> · Fecha de corte: {formatFecha(fechaCorte)}</span>
      {extraidoEl && <span> · Extraído el {formatFecha(extraidoEl)}</span>}
      {metodologiaHref && (
        <span>
          {" "}
          · <a href={metodologiaHref}>Ver metodología</a>
        </span>
      )}
    </footer>
  );
}
