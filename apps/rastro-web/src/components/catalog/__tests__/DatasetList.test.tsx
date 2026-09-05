// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DatasetList } from "../DatasetList.js";
import type { CatalogDataset } from "../../../lib/catalog-types.js";

function dataset(overrides: Partial<CatalogDataset>): CatalogDataset {
  return {
    name: overrides.name ?? "x",
    title: overrides.title ?? "X",
    notes: overrides.notes ?? "",
    organization: overrides.organization ?? null,
    tags: overrides.tags ?? [],
    resources: overrides.resources ?? [],
    url: overrides.url ?? null,
    modified: overrides.modified ?? null,
    num_resources: overrides.num_resources ?? 0,
  };
}

const FIXTURE: CatalogDataset[] = [
  dataset({
    name: "salud-mental",
    title: "MINSA - Salud Mental",
    notes: "Atenciones de salud mental",
    organization: { id: null, name: null, title: "Ministerio de Salud" },
    tags: ["salud"],
  }),
  dataset({
    name: "inversion-publica",
    title: "MEF - Inversión Pública",
    notes: "Ejecución de inversión pública",
    organization: { id: null, name: null, title: "MEF · Portal de Transparencia" },
    tags: ["inversion"],
  }),
  dataset({
    name: "sin-organizacion",
    title: "Dataset huérfano",
    notes: "Sin ministerio identificado",
    organization: null,
    tags: [],
  }),
];

describe("DatasetList", () => {
  it("renders every dataset when no filter is applied", () => {
    render(<DatasetList datasets={FIXTURE} />);
    expect(screen.getByText("MINSA - Salud Mental")).toBeInTheDocument();
    expect(screen.getByText("MEF - Inversión Pública")).toBeInTheDocument();
    expect(screen.getByText("Dataset huérfano")).toBeInTheDocument();
    expect(screen.getByText("3 de 3 datasets")).toBeInTheDocument();
  });

  it("filters by free-text search across title, notes and tags", async () => {
    const user = userEvent.setup();
    render(<DatasetList datasets={FIXTURE} />);
    await user.type(screen.getByPlaceholderText(/Buscar por título/), "mental");
    expect(screen.getByText("MINSA - Salud Mental")).toBeInTheDocument();
    expect(screen.queryByText("MEF - Inversión Pública")).not.toBeInTheDocument();
    expect(screen.getByText("1 de 3 datasets")).toBeInTheDocument();
  });

  it("filters by organization chip", async () => {
    const user = userEvent.setup();
    render(<DatasetList datasets={FIXTURE} />);
    await user.click(screen.getByRole("button", { name: /Ministerio de Salud/ }));
    expect(screen.getByText("MINSA - Salud Mental")).toBeInTheDocument();
    expect(screen.queryByText("MEF - Inversión Pública")).not.toBeInTheDocument();
    // El dataset sin organización nunca aparece en un filtro por org específica.
    expect(screen.queryByText("Dataset huérfano")).not.toBeInTheDocument();
  });

  it("shows an empty state when the filter matches nothing", async () => {
    const user = userEvent.setup();
    render(<DatasetList datasets={FIXTURE} />);
    await user.type(screen.getByPlaceholderText(/Buscar por título/), "no existe esto en ningún dataset");
    expect(screen.getByText("Sin datasets que coincidan con el filtro.")).toBeInTheDocument();
  });

  it("returning to 'Todos' after filtering shows every dataset again", async () => {
    const user = userEvent.setup();
    render(<DatasetList datasets={FIXTURE} />);
    await user.click(screen.getByRole("button", { name: /Ministerio de Salud/ }));
    expect(screen.getByText("1 de 3 datasets")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Todos/ }));
    expect(screen.getByText("3 de 3 datasets")).toBeInTheDocument();
  });

  it("deduplicates datasets that share the same name (regression: catalog-curated.json can repeat entries)", () => {
    const withDuplicate = [
      ...FIXTURE,
      dataset({ name: "salud-mental", title: "MINSA - Salud Mental", organization: { id: null, name: null, title: "Ministerio de Salud" } }),
    ];
    render(<DatasetList datasets={withDuplicate} />);
    expect(screen.getByText("3 de 3 datasets")).toBeInTheDocument();
    expect(screen.getAllByText("MINSA - Salud Mental")).toHaveLength(1);
  });
});
