import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceFootnote } from "@/components/SourceFootnote";

describe("SourceFootnote", () => {
  it("shows the dataset name", () => {
    render(<SourceFootnote dataset="CEPLAN - ObservaPerú (Gestión Estratégica del Estado)" />);
    expect(screen.getByTestId("source-footnote")).toHaveTextContent("ObservaPerú");
  });
});
