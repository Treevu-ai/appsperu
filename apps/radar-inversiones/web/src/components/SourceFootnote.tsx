import { formatFecha } from "@/lib/format";

export interface SourceFootnoteProps {
  dataset: string;
  extraidoEl?: string;
}

export function SourceFootnote({ dataset, extraidoEl }: SourceFootnoteProps) {
  return (
    <footer className="source-footnote" data-testid="source-footnote">
      <span>
        Fuente: <strong>{dataset}</strong>
      </span>
      {extraidoEl && <span> · Extraído el {formatFecha(extraidoEl)}</span>}
    </footer>
  );
}
