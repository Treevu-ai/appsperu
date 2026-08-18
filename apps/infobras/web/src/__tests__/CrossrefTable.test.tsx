import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossrefTable } from "@/components/CrossrefTable";
import type { CrossrefEntry } from "@/lib/api";

function entry(overrides: Partial<CrossrefEntry> = {}): CrossrefEntry {
  return {
    cui: "2441168",
    obras: 3,
    obrasParalizadas: 1,
    avanceFisicoRealPromedio: 88.61,
    enInversiones: true,
    nombreInversion: "REHABILITACIÓN DE REDES Y CONEXIONES DOMICILIARIAS",
    estadoInversion: "ACTIVO",
    montoViableInversion: 12754096,
    costoActualizadoInversion: 15701385.78,
    ...overrides,
  };
}

describe("CrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<CrossrefTable rows={[]} />);
    expect(screen.getByTestId("crossref-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("crossref-table")).not.toBeInTheDocument();
  });

  it("shows a confirmada chip and computed cost drift for a matched CUI", () => {
    render(<CrossrefTable rows={[entry()]} />);
    expect(screen.getByText("confirmada")).toHaveClass("confirmada");
    expect(screen.getByText("23.1%")).toBeInTheDocument();
  });

  it("shows a sin match chip and no drift for an unmatched CUI", () => {
    render(
      <CrossrefTable
        rows={[entry({ enInversiones: false, montoViableInversion: null, costoActualizadoInversion: null })]}
      />
    );
    expect(screen.getByText("sin match")).toHaveClass("neutral");
    expect(screen.getByText("sin dato")).toBeInTheDocument();
  });

  it("shows how many obras are paralizadas when there is at least one", () => {
    render(<CrossrefTable rows={[entry()]} />);
    expect(screen.getByText("1 paralizada")).toBeInTheDocument();
  });
});
