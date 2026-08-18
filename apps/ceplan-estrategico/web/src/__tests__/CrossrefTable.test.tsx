import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossrefTable } from "@/components/CrossrefTable";
import type { CrossrefRow } from "@/lib/api";

function row(overrides: Partial<CrossrefRow> = {}): CrossrefRow {
  return {
    nivelGobierno: "GN",
    nivelGobiernoRadarEjecucion: "GOBIERNO NACIONAL",
    anioCeplan: "2024-01-01T05:00:00.000Z",
    anioRadarEjecucion: 2026,
    ejecucionFisicaCeplan: 76.6,
    ejecucionPresupuestalCeplan: 95,
    ejecucionPresupuestalRadarEjecucion: 93.8,
    strategicExecutionGap: 17.2,
    executionEfficiency: 0.82,
    ...overrides,
  };
}

describe("CrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<CrossrefTable rows={[]} />);
    expect(screen.getByTestId("crossref-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("crossref-table")).not.toBeInTheDocument();
  });

  it("renders the bucket label with both reference years and the computed indicators", () => {
    render(<CrossrefTable rows={[row()]} />);
    expect(screen.getByText("GOBIERNO NACIONAL")).toBeInTheDocument();
    expect(screen.getByText(/CEPLAN 2024/)).toBeInTheDocument();
    expect(screen.getByText(/radar-ejecucion 2026/)).toBeInTheDocument();
    expect(screen.getByText("17.2 pp")).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });

  it("shows 'sin dato' instead of null when the crossref has no radar-ejecucion data", () => {
    render(
      <CrossrefTable
        rows={[
          row({
            ejecucionPresupuestalRadarEjecucion: null,
            strategicExecutionGap: null,
            executionEfficiency: null,
          }),
        ]}
      />
    );
    expect(screen.getAllByText("sin dato")).toHaveLength(3);
  });
});
