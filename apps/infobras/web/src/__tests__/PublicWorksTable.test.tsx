import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicWorksTable } from "@/components/PublicWorksTable";
import type { PublicWork } from "@/lib/api";

function work(overrides: Partial<PublicWork> = {}): PublicWork {
  return {
    codigoInfobras: "6",
    codigoEntidad: "0608",
    entidadNombre: "PROYECTO ESPECIAL CHAVIMOCHIC",
    nombreObra: "CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU",
    modalidadEjecucion: "Contrata",
    naturalezaObra: "Construcción/Creación",
    estadoEjecucion: "En Ejecución",
    nivelGobierno: "GOBIERNO REGIONAL",
    sectorEntidad: "AGRICULTURA",
    cui: "2111665",
    departamento: "LA LIBERTAD",
    provincia: "VIRU",
    distrito: "VIRU",
    montoViable: 1000000,
    costoActualizado: 1200000,
    avanceFisicoProgPct: 50,
    avanceFisicoRealPct: 80,
    ejecucionFinancieraPct: 50,
    existeParalizacion: false,
    causalParalizacion: null,
    fechaParalizacion: null,
    diasParalizado: null,
    costDriftPct: 20,
    gapFisicoFinanciero: 30,
    fuente: { dataset: "INFOBRAS - Datos Abiertos (Contraloría)" },
    ...overrides,
  };
}

describe("PublicWorksTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<PublicWorksTable rows={[]} />);
    expect(screen.getByTestId("public-works-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("public-works-table")).not.toBeInTheDocument();
  });

  it("renders the work name as a link to its ficha", () => {
    render(<PublicWorksTable rows={[work()]} />);
    const link = screen.getByRole("link", { name: "CONSTRUCCION DE CANALES INTEGRADORES VALLE VIRU" });
    expect(link).toHaveAttribute("href", "/obras/6");
  });

  it("shows a paralizada chip when the work has an active paralización", () => {
    render(<PublicWorksTable rows={[work({ existeParalizacion: true })]} />);
    expect(screen.getByText("paralizada")).toHaveClass("alerta");
  });

  it("shows a cost drift chip when drift is high and there is no paralización", () => {
    render(<PublicWorksTable rows={[work({ costDriftPct: 45 })]} />);
    expect(screen.getByText(/cost drift alto/)).toHaveClass("candidata");
  });

  it("shows a neutral chip when there are no active signals", () => {
    render(<PublicWorksTable rows={[work({ costDriftPct: 5 })]} />);
    expect(screen.getByText("sin alertas")).toHaveClass("neutral");
  });
});
