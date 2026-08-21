import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntidadCrossrefTable } from "@/components/EntidadCrossrefTable";
import type { EntidadCrossrefEntry } from "@/lib/api";

function row(overrides: Partial<EntidadCrossrefEntry> = {}): EntidadCrossrefEntry {
  return {
    entityCode: "301189",
    nombreEnRadarEjecucion: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
    ruc: "20141897935",
    razonSocialEnPadron: "MUNICIPALIDAD PROVINCIAL SANCHEZ CARRION",
    confidence: "candidata",
    score: 0.8,
    estadoContribuyente: "ACTIVO",
    condicionDomicilio: "HABIDO",
    ...overrides,
  };
}

describe("EntidadCrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<EntidadCrossrefTable rows={[]} />);
    expect(screen.getByTestId("entidad-crossref-empty")).toBeInTheDocument();
  });

  it("renders the real Sánchez Carrión match with its confidence and score", () => {
    render(<EntidadCrossrefTable rows={[row()]} />);
    expect(screen.getByText("20141897935")).toBeInTheDocument();
    expect(screen.getByText("candidata (0.80)")).toHaveClass("candidata");
  });

  it("renders an exact match with the confirmada style", () => {
    render(<EntidadCrossrefTable rows={[row({ confidence: "confirmada", score: 1 })]} />);
    expect(screen.getByText("confirmada (1.00)")).toHaveClass("confirmada");
  });
});
