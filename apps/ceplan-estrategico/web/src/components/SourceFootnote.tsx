export interface SourceFootnoteProps {
  dataset: string;
}

export function SourceFootnote({ dataset }: SourceFootnoteProps) {
  return (
    <footer className="source-footnote" data-testid="source-footnote">
      <span>
        Fuente: <strong>{dataset}</strong>
      </span>
    </footer>
  );
}
