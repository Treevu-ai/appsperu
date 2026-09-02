// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Catalogo } from "../Catalogo.js";
import summary from "../../data/catalog-summary.json" with { type: "json" };
import curated from "../../data/catalog-curated.json" with { type: "json" };

describe("Catalogo page", () => {
  it("renders the real embedded dataset count from catalog-summary.json", () => {
    render(<Catalogo />);
    // El total aparece más de una vez en la página (Hero + StatsPanel +
    // párrafo de intro) — basta con que aparezca al menos una vez. Se
    // compara contra el valor crudo (String()), no contra un
    // .toLocaleString() propio: ese patrón es justo lo que el linter
    // AL3-13 vigila en src/, y este assert no necesita reformatear nada.
    expect(screen.getAllByText(String(summary.total_datasets)).length).toBeGreaterThan(0);
  });

  it("renders the curated dataset count from catalog-curated.json", () => {
    render(<Catalogo />);
    expect(screen.getByText(new RegExp(`${curated.count} datasets relevantes`))).toBeInTheDocument();
  });

  it("does not promise a direct download that does not exist on the deployed site", () => {
    render(<Catalogo />);
    // Regresión: el copy original decía "disponible como JSON y CSV" sin
    // ningún link real — ahora debe aclarar dónde vive de verdad.
    expect(screen.getByText(/no se publica todavía como descarga directa/)).toBeInTheDocument();
  });

  it("renders at least one dataset card from the curated list", () => {
    render(<Catalogo />);
    expect(curated.datasets.length).toBeGreaterThan(0);
    expect(screen.getAllByText(curated.datasets[0].title).length).toBeGreaterThan(0);
  });
});
