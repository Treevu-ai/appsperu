// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DatasetCard } from "../DatasetCard.js";
import type { CatalogDataset } from "../../../lib/catalog-types.js";

function makeDataset(overrides: Partial<CatalogDataset> = {}): CatalogDataset {
  return {
    name: "dataset-de-prueba",
    title: "Dataset de prueba",
    notes: "Descripción de prueba",
    organization: { id: null, name: null, title: "Ministerio de Prueba" },
    tags: [],
    resources: [
      { id: "r1", url: "https://example.test/r1.csv", format: "CSV", size_kb: null, description: "" },
    ],
    url: "https://example.test/dataset-de-prueba",
    modified: "2026-08-15",
    num_resources: 1,
    ...overrides,
  };
}

describe("DatasetCard", () => {
  it("shows the RASTRO badge when the organization name matches a Rastro-relevant keyword", () => {
    render(<DatasetCard ds={makeDataset({ organization: { id: null, name: "MEF - Contrataciones", title: "MEF" } })} />);
    expect(screen.getByTitle("Relevante para inversión pública")).toBeInTheDocument();
  });

  it("shows the RASTRO badge when a tag matches, even if the org name doesn't", () => {
    render(
      <DatasetCard
        ds={makeDataset({
          organization: { id: null, name: null, title: "Ministerio de Salud" },
          tags: ["inversion", "salud publica"],
        })}
      />,
    );
    expect(screen.getByTitle("Relevante para inversión pública")).toBeInTheDocument();
  });

  it("does not show the RASTRO badge for an unrelated dataset", () => {
    render(<DatasetCard ds={makeDataset({ organization: { id: null, name: null, title: "Ministerio de Salud" }, tags: ["salud mental"] })} />);
    expect(screen.queryByTitle("Relevante para inversión pública")).not.toBeInTheDocument();
  });

  it("renders the title as a link when url is present", () => {
    render(<DatasetCard ds={makeDataset({ url: "https://example.test/x" })} />);
    const link = screen.getByRole("link", { name: "Dataset de prueba" });
    expect(link).toHaveAttribute("href", "https://example.test/x");
  });

  it("renders the title as plain text (no link) when url is null", () => {
    render(<DatasetCard ds={makeDataset({ url: null })} />);
    expect(screen.queryByRole("link", { name: "Dataset de prueba" })).not.toBeInTheDocument();
    expect(screen.getByText("Dataset de prueba")).toBeInTheDocument();
  });

  it("shows every distinct resource format, deduplicated", () => {
    render(
      <DatasetCard
        ds={makeDataset({
          resources: [
            { id: "r1", url: "https://example.test/r1.csv", format: "CSV", size_kb: null, description: "" },
            { id: "r2", url: "https://example.test/r2.csv", format: "CSV", size_kb: null, description: "" },
            { id: "r3", url: "https://example.test/r3.xlsx", format: "XLSX", size_kb: null, description: "" },
          ],
        })}
      />,
    );
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("XLSX")).toBeInTheDocument();
  });

  it("shows the organization fallback text when organization is null", () => {
    render(<DatasetCard ds={makeDataset({ organization: null })} />);
    expect(screen.getByText("Sin organización")).toBeInTheDocument();
  });
});
