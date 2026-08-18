import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceFootnote } from "@/components/SourceFootnote";

describe("SourceFootnote", () => {
  it("always shows the dataset name", () => {
    render(<SourceFootnote dataset="MEF - Invierte.pe / Banco de Inversiones" />);
    expect(screen.getByTestId("source-footnote")).toHaveTextContent("MEF - Invierte.pe / Banco de Inversiones");
  });

  it("shows the extraction date only when provided", () => {
    const { rerender } = render(<SourceFootnote dataset="MEF" />);
    expect(screen.queryByText(/Extraído el/)).not.toBeInTheDocument();

    rerender(<SourceFootnote dataset="MEF" extraidoEl="2026-08-17T00:00:00.000Z" />);
    expect(screen.getByText(/Extraído el/)).toBeInTheDocument();
  });
});
