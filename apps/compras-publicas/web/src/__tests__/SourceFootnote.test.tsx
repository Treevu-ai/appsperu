import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceFootnote } from "@/components/SourceFootnote";

describe("SourceFootnote", () => {
  it("always shows the dataset name", () => {
    render(<SourceFootnote dataset="OECE - Contrataciones Abiertas (OCDS)" />);
    expect(screen.getByTestId("source-footnote")).toHaveTextContent("OECE - Contrataciones Abiertas (OCDS)");
  });

  it("shows the extraction date only when provided", () => {
    const { rerender } = render(<SourceFootnote dataset="OECE" />);
    expect(screen.queryByText(/Extraído el/)).not.toBeInTheDocument();

    rerender(<SourceFootnote dataset="OECE" extraidoEl="2026-08-16T19:20:00.000Z" />);
    expect(screen.getByText(/Extraído el/)).toBeInTheDocument();
  });
});
