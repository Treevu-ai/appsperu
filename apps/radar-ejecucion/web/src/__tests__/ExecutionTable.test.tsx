import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutionTable } from "@/components/ExecutionTable";
import type { ExecutionRow } from "@/lib/api";

function row(overrides: Partial<ExecutionRow> = {}): ExecutionRow {
  return {
    entityCode: "001",
    nombre: "Municipalidad de Ejemplo",
    nivelGobierno: "GOBIERNO_LOCAL",
    funcion: "Educación",
    anioFiscal: 2025,
    pia: 1000000,
    pim: 1200000,
    devengado: 900000,
    avancePct: 75,
    fechaCorte: "2026-08-16",
    fuente: { dataset: "MEF", resourceId: "abc" },
    ...overrides,
  };
}

describe("ExecutionTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<ExecutionTable rows={[]} />);
    expect(screen.getByTestId("execution-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("execution-table")).not.toBeInTheDocument();
  });

  it("renders one row per result with a link to its entity page", () => {
    render(<ExecutionTable rows={[row()]} />);
    const link = screen.getByRole("link", { name: "Municipalidad de Ejemplo" });
    expect(link).toHaveAttribute("href", "/entidad/001");
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  it("shows an explicit placeholder instead of a misleading 0% when avance is null", () => {
    render(<ExecutionTable rows={[row({ avancePct: null })]} />);
    expect(screen.getByText("sin dato")).toBeInTheDocument();
  });
});
