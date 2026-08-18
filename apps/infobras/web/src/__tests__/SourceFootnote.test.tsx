import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceFootnote } from "@/components/SourceFootnote";

describe("SourceFootnote", () => {
  it("renders the dataset name", () => {
    render(<SourceFootnote dataset="INFOBRAS - Datos Abiertos (Contraloría)" />);
    expect(screen.getByText("INFOBRAS - Datos Abiertos (Contraloría)")).toBeInTheDocument();
  });

  it("renders the extraction date when provided", () => {
    render(<SourceFootnote dataset="INFOBRAS" extraidoEl="2026-08-16T22:04:00.000Z" />);
    expect(screen.getByText(/Extraído el/)).toBeInTheDocument();
  });

  it("omits the extraction date when not provided", () => {
    render(<SourceFootnote dataset="INFOBRAS" />);
    expect(screen.queryByText(/Extraído el/)).not.toBeInTheDocument();
  });
});
