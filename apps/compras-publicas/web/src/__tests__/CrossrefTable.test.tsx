import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrossrefTable } from "@/components/CrossrefTable";
import type { CrossrefEntry } from "@/lib/api";

function row(overrides: Partial<CrossrefEntry> = {}): CrossrefEntry {
  return {
    mefEntityCode: "854",
    mefNombre: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
    oeceBuyerId: "PE-CONSUCODE-1339",
    oeceBuyerName: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
    confidence: "confirmada",
    score: 1,
    devengado: 30865325,
    comprasProcesos: 7,
    comprasValorTotal: 1234447,
    computedAt: "2026-08-16T20:00:00.000Z",
    ...overrides,
  };
}

describe("CrossrefTable", () => {
  it("shows an explicit empty state instead of an empty table", () => {
    render(<CrossrefTable rows={[]} />);
    expect(screen.getByTestId("crossref-table-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("crossref-table")).not.toBeInTheDocument();
  });

  it("renders both entity names side by side with a confidence chip", () => {
    render(<CrossrefTable rows={[row()]} />);
    expect(screen.getAllByText("MUNICIPALIDAD PROVINCIAL DE TRUJILLO")).toHaveLength(2);
    expect(screen.getByText(/confirmada · 100%/)).toBeInTheDocument();
  });

  it("renders a distinct chip style for candidata rows", () => {
    render(<CrossrefTable rows={[row({ confidence: "candidata", score: 0.5 })]} />);
    const chip = screen.getByText(/candidata · 50%/);
    expect(chip).toHaveClass("candidata");
  });
});
