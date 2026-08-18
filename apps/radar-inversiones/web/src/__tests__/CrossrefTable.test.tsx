import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossrefTable } from "@/components/CrossrefTable";
import type { CrossrefEntry } from "@/lib/api";

function row(overrides: Partial<CrossrefEntry> = {}): CrossrefEntry {
  return {
    secEjec: "301209",
    nombreUep: "MUNICIPALIDAD PROVINCIAL DE VIRU",
    nombreEnPresupuesto: "MUNICIPALIDAD PROVINCIAL DE VIRU",
    enPresupuesto: true,
    inversiones: 40,
    montoViableTotal: 199505623.26,
    costoActualizadoTotal: 210856839.45,
    devengado: 6809171.47,
    ...overrides,
  };
}

describe("CrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<CrossrefTable rows={[]} />);
    expect(screen.getByTestId("crossref-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("crossref-table")).not.toBeInTheDocument();
  });

  it("renders a confirmed match with a green chip", () => {
    render(<CrossrefTable rows={[row()]} />);
    expect(screen.getByText("MUNICIPALIDAD PROVINCIAL DE VIRU")).toBeInTheDocument();
    expect(screen.getByText("en presupuesto")).toHaveClass("confirmada");
  });

  it("renders a neutral chip and zeroed devengado when there is no budget match", () => {
    render(<CrossrefTable rows={[row({ enPresupuesto: false, devengado: 0, nombreEnPresupuesto: null })]} />);
    expect(screen.getByText("sin match")).toHaveClass("neutral");
  });
});
