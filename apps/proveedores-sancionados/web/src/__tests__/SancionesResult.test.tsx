import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SancionesResult } from "@/components/SancionesResult";
import type { SancionesResponse } from "@/lib/api";

function data(overrides: Partial<SancionesResponse> = {}): SancionesResponse {
  return {
    ruc: "20571603579",
    tieneInhabilitacionVigente: true,
    inhabilitaciones: [
      {
        razon_social: "GEOMATICA CONSULTORES Y EJECUTORES S.A.C.",
        resolucion: "6386-2026-TCP-S4",
        periodo_inhabilitacion: "DEFINITIVO",
        desde: "2026-07-31",
        hasta: null,
        infraccion: "f) Ocasionar que la Entidad resuelva el contrato",
        otra_infraccion: null,
        norma: "TUO de la Ley N° 30225",
        estado: "VIGENTE",
      },
    ],
    multas: [],
    ...overrides,
  };
}

describe("SancionesResult", () => {
  it("shows an explicit empty state when there is no sanction at all", () => {
    render(<SancionesResult data={data({ inhabilitaciones: [], multas: [], tieneInhabilitacionVigente: false })} />);
    expect(screen.getByTestId("sanciones-result-empty")).toBeInTheDocument();
  });

  it("renders the real GEOMATICA case with the irregular chip", () => {
    render(<SancionesResult data={data()} />);
    expect(screen.getByText("Inhabilitación VIGENTE")).toHaveClass("irregular");
    expect(screen.getByText("6386-2026-TCP-S4")).toBeInTheDocument();
  });

  it("shows the neutral chip when there is no vigente inhabilitación", () => {
    render(
      <SancionesResult
        data={data({
          tieneInhabilitacionVigente: false,
          inhabilitaciones: [
            {
              razon_social: "X",
              resolucion: "1-2020",
              periodo_inhabilitacion: "12 MESES",
              desde: "2020-01-01",
              hasta: "2021-01-01",
              infraccion: null,
              otra_infraccion: null,
              norma: null,
              estado: "NO VIGENTE",
            },
          ],
        })}
      />
    );
    expect(screen.getByText("Sin inhabilitación vigente hoy")).toHaveClass("neutral");
  });

  it("renders multas with a formatted amount", () => {
    render(
      <SancionesResult
        data={data({
          multas: [
            {
              razon_social: "PUMA ASOCIADOS S.R.L.",
              resolucion: "1992-2026-TCP-S5",
              fecha_resolucion: "2026-02-27",
              monto_multa: 3611558.19,
              infraccion: null,
              periodo_suspension: "3 MESES",
              desde: null,
              hasta: null,
              norma: null,
              estado: "VIGENTE",
            },
          ],
        })}
      />
    );
    expect(screen.getByTestId("multas-table")).toBeInTheDocument();
    expect(screen.getByText("3,611,558.19")).toBeInTheDocument();
  });
});
