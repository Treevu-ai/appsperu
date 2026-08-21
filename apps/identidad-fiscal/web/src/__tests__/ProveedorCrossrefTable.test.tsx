import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProveedorCrossrefTable } from "@/components/ProveedorCrossrefTable";
import type { ProveedorCrossrefEntry } from "@/lib/api";

function row(overrides: Partial<ProveedorCrossrefEntry> = {}): ProveedorCrossrefEntry {
  return {
    ocid: "ocds-dgv273-seacev3-99518",
    awardId: "99518-20559640418",
    supplierId: "PE-RUC-20559640418",
    supplierName: "CONSTRUCTORA INMOBILIARIA BERNAL & ASOCIADOS S.A.C.",
    buyerName: "MUNICIPALIDAD PROVINCIAL DE VIRU",
    valorMonto: 33772.2,
    valorMoneda: "PEN",
    fecha: "2015-04-30T05:00:00.000Z",
    rucValido: true,
    encontradoEnPadron: true,
    estadoContribuyente: "BAJA DE OFICIO",
    condicionDomicilio: "HABIDO",
    ubigeoProveedor: "200104",
    irregular: true,
    ...overrides,
  };
}

describe("ProveedorCrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<ProveedorCrossrefTable rows={[]} />);
    expect(screen.getByTestId("proveedor-crossref-empty")).toBeInTheDocument();
  });

  it("flags an irregular supplier with the irregular chip", () => {
    render(<ProveedorCrossrefTable rows={[row()]} />);
    const chip = screen.getByText(/BAJA DE OFICIO/);
    expect(chip).toHaveClass("irregular");
  });

  it("does not flag a regular supplier", () => {
    render(
      <ProveedorCrossrefTable
        rows={[row({ irregular: false, estadoContribuyente: "ACTIVO", condicionDomicilio: "HABIDO" })]}
      />
    );
    expect(screen.queryByText(/ACTIVO/)?.className).not.toContain("irregular");
  });

  it("labels a consortium without a standard RUC instead of guessing", () => {
    render(
      <ProveedorCrossrefTable
        rows={[
          row({
            rucValido: false,
            encontradoEnPadron: false,
            estadoContribuyente: null,
            condicionDomicilio: null,
            irregular: false,
          }),
        ]}
      />
    );
    expect(screen.getByText("RUC no estándar (consorcio)")).toBeInTheDocument();
  });
});
