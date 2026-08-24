import { describe, expect, it } from "vitest";
import { deriveSignals } from "../minor-contracts/derive-signals.js";
import { normalizeContractObject } from "../minor-contracts/normalize-object.js";
import type { MinorContractForSignals } from "../minor-contracts/types.js";

function contract(overrides: Partial<MinorContractForSignals> = {}): MinorContractForSignals {
  return {
    contractingId: "c-1", sourceContractingId: "source-c-1", municipalityId: "m-1", supplierId: "s-1",
    objectNormalized: "mantenimiento camioneta toyota hilux", awardedAmount: 43_500,
    publicationDate: "2026-02-01T08:00:00-05:00", quotationEndDate: "2026-02-01T12:00:00-05:00",
    quotationCount: 1, validQuotationCount: null, evidenceFound: 3, evidenceExpected: 4,
    ...overrides,
  };
}

describe("normalizeContractObject", () => {
  it("normalizes accents and punctuation without changing the raw source elsewhere", () => {
    expect(normalizeContractObject("Mantenimiento: Camioneta Toyota Hílux"))
      .toBe("mantenimiento camioneta toyota hilux");
  });
  it("does not manufacture an object from a missing title", () => {
    expect(normalizeContractObject(null)).toBeNull();
  });
});

describe("deriveSignals", () => {
  it("marks an amount near 8 UIT as descriptive rather than a legal conclusion", () => {
    const signal = deriveSignals([contract()]).find((item) => item.signalType === "S05");
    expect(signal?.observedValue).toMatchObject({ awardedAmount: 43_500, band: "98%" });
    expect(signal?.severity).toBe("INFO");
    expect(signal?.explanation).toMatch(/no constituye un umbral jurídico/i);
  });

  it("does not create a low-participation signal when validity is unknown", () => {
    const signals = deriveSignals([contract({ validQuotationCount: null })]);
    expect(signals.some((item) => item.signalType === "S03")).toBe(false);
  });

  it("creates recurrence and an exploratory sequence without calling it fraccionamiento", () => {
    const signals = deriveSignals([
      contract(),
      contract({ contractingId: "c-2", publicationDate: "2026-02-15T08:00:00-05:00", awardedAmount: 20_000 }),
    ]);
    expect(signals.some((item) => item.signalType === "S01")).toBe(true);
    const sequence = signals.find((item) => item.signalType === "S07");
    expect(sequence?.relatedContractingIds).toEqual(["c-1", "c-2"]);
    expect(sequence?.explanation).toMatch(/no determina fraccionamiento/i);
  });

  it("emits evidence coverage with the absence caveat", () => {
    const signal = deriveSignals([contract()]).find((item) => item.signalType === "S09");
    expect(signal?.observedValue).toMatchObject({ evidenceFound: 3, evidenceExpected: 4 });
    expect(signal?.explanation).toMatch(/no equivale a incumplimiento/i);
  });

  it("uses embeddings to find comparable wording even where lexical similarity is weak", () => {
    const signals = deriveSignals([
      contract({ objectNormalized: "alquiler de retroexcavadora para limpieza", semanticEmbedding: [1, 0], semanticModelVersion: "embedding:local:test" }),
      contract({ contractingId: "c-2", sourceContractingId: "source-c-2", objectNormalized: "maquinaria pesada para descolmatacion", publicationDate: "2026-02-15T08:00:00-05:00", semanticEmbedding: [0.99, 0.01], semanticModelVersion: "embedding:local:test" }),
    ]);
    expect(signals.some((item) => item.signalType === "S06")).toBe(false);
    expect(signals.some((item) => item.signalType === "S11")).toBe(true);
    const sequence = signals.find((item) => item.signalType === "S12");
    expect(sequence?.explanation).toMatch(/no determina fraccionamiento ni direccionamiento/i);
    expect(signals.some((item) => item.signalType === "S13")).toBe(true);
  });

  it("does not compare separate items of the same source contracting", () => {
    const signals = deriveSignals([
      contract({ semanticEmbedding: [1, 0], semanticModelVersion: "embedding:local:test" }),
      contract({ contractingId: "c-2", sourceContractingId: "source-c-1", semanticEmbedding: [1, 0], semanticModelVersion: "embedding:local:test" }),
    ]);
    expect(signals.some((item) => item.signalType === "S11" || item.signalType === "S12" || item.signalType === "S13")).toBe(false);
  });
});
