import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestmentTable } from "@/components/InvestmentTable";
import type { Investment } from "@/lib/api";

function row(overrides: Partial<Investment> = {}): Investment {
  return {
    cui: "2716769",
    codigoSnip: "2716769",
    nombre: "MEJORAMIENTO DEL SERVICIO DE AGUA",
    secEjec: "300790",
    nombreUep: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
    entidad: "MUNICIPALIDAD DISTRITAL DE OLLANTAYTAMBO",
    sector: "GOBIERNOS LOCALES",
    nivel: "GL",
    estado: "ACTIVO",
    situacion: "VIABLE",
    departamento: "LA LIBERTAD",
    provincia: "TRUJILLO",
    distrito: "TRUJILLO",
    montoViable: 231477495.2,
    costoActualizado: 368314197.8,
    funcion: "SALUD",
    tipoInversion: "PROYECTO DE INVERSION",
    fechaRegistro: "2022-01-05",
    fechaViabilidad: "2022-03-10",
    fuente: { dataset: "MEF - Invierte.pe" },
    ...overrides,
  };
}

describe("InvestmentTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<InvestmentTable rows={[]} />);
    expect(screen.getByTestId("investment-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("investment-table")).not.toBeInTheDocument();
  });

  it("renders a row with a link to its detail page and highlights cost overrun", () => {
    render(<InvestmentTable rows={[row()]} />);
    const link = screen.getByRole("link", { name: /MEJORAMIENTO DEL SERVICIO DE AGUA/ });
    expect(link).toHaveAttribute("href", "/inversion/2716769");
    expect(screen.getByText("+59.1%")).toHaveClass("candidata");
  });

  it("does not flag a chip when the cost did not increase", () => {
    render(<InvestmentTable rows={[row({ costoActualizado: 200000000 })]} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows an explicit placeholder instead of blanks when variation cannot be computed", () => {
    render(<InvestmentTable rows={[row({ montoViable: null })]} />);
    // "sin dato" aparece dos veces: en el monto viable (null) y en la
    // variación (que tampoco se puede calcular sin ambos montos).
    expect(screen.getAllByText("sin dato")).toHaveLength(2);
  });
});
