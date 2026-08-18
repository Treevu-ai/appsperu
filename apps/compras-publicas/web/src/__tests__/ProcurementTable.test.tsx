import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcurementTable } from "@/components/ProcurementTable";
import type { ProcurementProcess } from "@/lib/api";

function row(overrides: Partial<ProcurementProcess> = {}): ProcurementProcess {
  return {
    ocid: "ocds-dgv273-seacev3-2026-1209-17",
    tenderId: "1240819",
    sourceId: "seace_v3",
    buyerId: "PE-CONSUCODE-1209",
    buyerName: "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION - HUAMACHUCO",
    departamento: "LA LIBERTAD",
    provincia: "SANCHEZ CARRION",
    distrito: "HUAMACHUCO",
    categoria: "goods",
    titulo: "LP-ABR-23-2026-MPSC-1",
    valorMonto: 352698,
    valorMoneda: "PEN",
    fechaPublicacion: "2026-08-12T16:38:00-05:00",
    tenderInicio: null,
    tenderFin: null,
    tags: ["planning", "tender"],
    fuente: { dataset: "OECE" },
    ...overrides,
  };
}

describe("ProcurementTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<ProcurementTable rows={[]} />);
    expect(screen.getByTestId("procurement-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("procurement-table")).not.toBeInTheDocument();
  });

  it("renders one row per process with a link to its detail page", () => {
    render(<ProcurementTable rows={[row()]} />);
    const link = screen.getByRole("link", { name: /SANCHEZ CARRION/ });
    expect(link).toHaveAttribute("href", `/proceso/${encodeURIComponent("ocds-dgv273-seacev3-2026-1209-17")}`);
    expect(screen.getByText("Bienes")).toBeInTheDocument();
  });

  it("shows explicit placeholders instead of blanks when fields are null", () => {
    render(<ProcurementTable rows={[row({ titulo: null, valorMonto: null, provincia: null, distrito: null })]} />);
    expect(screen.getByText("sin título")).toBeInTheDocument();
    expect(screen.getByText("sin dato")).toBeInTheDocument();
  });
});
