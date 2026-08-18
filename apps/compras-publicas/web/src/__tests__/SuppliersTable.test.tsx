import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SuppliersTable } from "@/components/SuppliersTable";
import type { SupplierSummary } from "@/lib/api";

function row(overrides: Partial<SupplierSummary> = {}): SupplierSummary {
  return {
    supplierId: "PE-RUC-20600559681",
    supplierName: "CAM SERVICIOS DEL PERU S.A.",
    adjudicaciones: 2,
    entidadesDistintas: 2,
    valorTotal: 66687817.17,
    ...overrides,
  };
}

describe("SuppliersTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<SuppliersTable rows={[]} />);
    expect(screen.getByTestId("suppliers-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("suppliers-table")).not.toBeInTheDocument();
  });

  it("renders the supplier name as a link to its ficha", () => {
    render(<SuppliersTable rows={[row()]} />);
    const link = screen.getByRole("link", { name: "CAM SERVICIOS DEL PERU S.A." });
    expect(link).toHaveAttribute("href", "/proveedores/PE-RUC-20600559681");
  });

  it("formats the total value as soles", () => {
    render(<SuppliersTable rows={[row()]} />);
    expect(screen.getByText("S/ 66,687,817")).toBeInTheDocument();
  });
});
