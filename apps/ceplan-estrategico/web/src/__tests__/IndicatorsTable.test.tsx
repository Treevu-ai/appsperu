import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorsTable } from "@/components/IndicatorsTable";
import type { IndicatorRow } from "@/lib/api";

function row(overrides: Partial<IndicatorRow> = {}): IndicatorRow {
  return {
    indicatorCode: "CUMP02",
    indicatorName: "Ejecución física del POI",
    serieId: "gn",
    serieLabel: "Gobierno nacional",
    nivelGobierno: "GN",
    value: 76.6,
    measurementDate: "2024-01-01T05:00:00.000Z",
    unitOfMeasure: "%",
    frequency: "anual",
    fuente: { dataset: "CEPLAN - ObservaPerú (Gestión Estratégica del Estado)" },
    ...overrides,
  };
}

describe("IndicatorsTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<IndicatorsTable rows={[]} />);
    expect(screen.getByTestId("indicators-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("indicators-table")).not.toBeInTheDocument();
  });

  it("renders indicator code, serie, nivel de gobierno, valor and año", () => {
    render(<IndicatorsTable rows={[row()]} />);
    expect(screen.getByText("CUMP02")).toBeInTheDocument();
    expect(screen.getByText("Gobierno nacional")).toBeInTheDocument();
    expect(screen.getByText("GN")).toBeInTheDocument();
    expect(screen.getByText("76.6 %")).toBeInTheDocument();
    expect(screen.getByText("2024")).toBeInTheDocument();
  });

  it("shows an em dash when nivelGobierno is null", () => {
    render(<IndicatorsTable rows={[row({ nivelGobierno: null, serieId: "total", serieLabel: "Total" })]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
