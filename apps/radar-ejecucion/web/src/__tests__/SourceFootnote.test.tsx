import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceFootnote } from "@/components/SourceFootnote";

describe("SourceFootnote", () => {
  it("always shows dataset, resource id and fecha de corte", () => {
    render(<SourceFootnote dataset="MEF - Presupuesto y ejecución de gasto" resourceId="abc-123" fechaCorte="2026-08-16" />);
    const footnote = screen.getByTestId("source-footnote");
    expect(footnote).toHaveTextContent("MEF - Presupuesto y ejecución de gasto");
    expect(footnote).toHaveTextContent("abc-123");
    expect(footnote).toHaveTextContent(/Fecha de corte/);
  });

  it("renders a methodology link only when provided", () => {
    const { rerender } = render(
      <SourceFootnote dataset="MEF" resourceId="abc" fechaCorte="2026-08-16" />
    );
    expect(screen.queryByText("Ver metodología")).not.toBeInTheDocument();

    rerender(
      <SourceFootnote
        dataset="MEF"
        resourceId="abc"
        fechaCorte="2026-08-16"
        metodologiaHref="/docs/metodologia"
      />
    );
    expect(screen.getByText("Ver metodología")).toHaveAttribute("href", "/docs/metodologia");
  });
});
