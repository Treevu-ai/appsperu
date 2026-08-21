import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreTable } from "@/components/ScoreTable";
import type { EntityScore } from "@/lib/api";

function row(overrides: Partial<EntityScore> = {}): EntityScore {
  return {
    entityCode: "301189",
    nombre: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
    scoreCompuesto: 58.6,
    componentesUsados: 5,
    componentes: {
      ejecucion: { valor: 34.6, disponible: true },
      obrasNoParalizadas: { valor: 90.6, disponible: true },
      inversionesSinSobrecosto: { valor: 29.8, disponible: true },
      comprasNoConcentradas: { valor: 38, disponible: true },
      saludTributariaProveedores: { valor: 100, disponible: true },
    },
    ...overrides,
  };
}

describe("ScoreTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<ScoreTable rows={[]} />);
    expect(screen.getByTestId("score-table-empty")).toBeInTheDocument();
  });

  it("renders the real Sánchez Carrión case with the candidata-range chip (40-69)", () => {
    render(<ScoreTable rows={[row()]} />);
    expect(screen.getByText("58.6")).toHaveClass("candidata");
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });

  it("shows a green chip for a high score", () => {
    render(<ScoreTable rows={[row({ scoreCompuesto: 82.6 })]} />);
    expect(screen.getByText("82.6")).toHaveClass("confirmada");
  });

  it("shows a red chip for a low score", () => {
    render(<ScoreTable rows={[row({ scoreCompuesto: 31.4 })]} />);
    expect(screen.getByText("31.4")).toHaveClass("irregular");
  });

  it("shows a placeholder, not a fabricated value, for a component with no data", () => {
    render(
      <ScoreTable
        rows={[
          row({
            componentesUsados: 1,
            componentes: {
              ejecucion: { valor: null, disponible: false },
              obrasNoParalizadas: { valor: null, disponible: false },
              inversionesSinSobrecosto: { valor: null, disponible: false },
              comprasNoConcentradas: { valor: null, disponible: false },
              saludTributariaProveedores: { valor: 100, disponible: true },
            },
          }),
        ]}
      />
    );
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("shows a neutral chip when the composite score itself is unavailable", () => {
    render(<ScoreTable rows={[row({ scoreCompuesto: null, componentesUsados: 0 })]} />);
    expect(screen.getByText("sin dato")).toHaveClass("neutral");
  });
});
