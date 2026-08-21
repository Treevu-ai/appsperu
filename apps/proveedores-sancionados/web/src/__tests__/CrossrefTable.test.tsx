import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossrefTable } from "@/components/CrossrefTable";
import type { CrossrefEntry } from "@/lib/api";

function row(overrides: Partial<CrossrefEntry> = {}): CrossrefEntry {
  return {
    ocid: "ocds-dgv273-seacev3-2024-10492-2",
    awardId: "998828-20481280410",
    supplierId: "PE-RUC-20481280410",
    supplierName: "AGUSTINA SERVICIOS GENERALES S.A.C",
    buyerName: "GOBIERNO REGIONAL DE LA LIBERTAD-EDUCACION USE CHEPEN",
    valorMonto: 344000,
    valorMoneda: "PEN",
    fecha: "2024-04-08T05:00:00.000Z",
    rucValido: true,
    inhabilitacionesEncontradas: 2,
    tieneInhabilitacionVigente: true,
    estadoContribuyente: "ACTIVO",
    condicionDomicilio: "HABIDO",
    ...overrides,
  };
}

describe("CrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<CrossrefTable rows={[]} />);
    expect(screen.getByTestId("crossref-table-empty")).toBeInTheDocument();
  });

  it("flags a real case with inhabilitación vigente hoy", () => {
    render(<CrossrefTable rows={[row()]} />);
    expect(screen.getByText("VIGENTE hoy (2)")).toHaveClass("irregular");
  });

  it("labels a historical (non-vigente) sanction distinctly", () => {
    render(<CrossrefTable rows={[row({ tieneInhabilitacionVigente: false, inhabilitacionesEncontradas: 1 })]} />);
    expect(screen.getByText("histórica (1)")).toHaveClass("candidata");
  });

  it("shows 'sin registro' when the supplier has no sanction at all", () => {
    render(<CrossrefTable rows={[row({ tieneInhabilitacionVigente: false, inhabilitacionesEncontradas: 0 })]} />);
    expect(screen.getByText("sin registro")).toBeInTheDocument();
  });

  it("labels a non-standard RUC (consortium) instead of guessing", () => {
    render(<CrossrefTable rows={[row({ rucValido: false })]} />);
    expect(screen.getByText("RUC no estándar")).toBeInTheDocument();
  });
});
