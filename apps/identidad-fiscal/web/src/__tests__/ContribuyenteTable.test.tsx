import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContribuyenteTable } from "@/components/ContribuyenteTable";
import type { Contribuyente } from "@/lib/api";

function row(overrides: Partial<Contribuyente> = {}): Contribuyente {
  return {
    ruc: "20156058719",
    razonSocial: "PROYECTO ESPECIAL CHAVIMOCHIC",
    estadoContribuyente: "ACTIVO",
    condicionDomicilio: "HABIDO",
    ubigeo: "130111",
    direccion: "AV. JUAN JULIO GANOZA 150",
    ...overrides,
  };
}

describe("ContribuyenteTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<ContribuyenteTable rows={[]} />);
    expect(screen.getByTestId("contribuyente-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("contribuyente-table")).not.toBeInTheDocument();
  });

  it("renders a real contribuyente row", () => {
    render(<ContribuyenteTable rows={[row()]} />);
    expect(screen.getByText("PROYECTO ESPECIAL CHAVIMOCHIC")).toBeInTheDocument();
    expect(screen.getByText("20156058719")).toBeInTheDocument();
    expect(screen.getByText("ACTIVO")).toBeInTheDocument();
  });

  it("shows a placeholder instead of blanks when a field is missing", () => {
    render(<ContribuyenteTable rows={[row({ ubigeo: null, direccion: null })]} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
