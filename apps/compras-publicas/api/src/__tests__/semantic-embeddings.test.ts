import { describe, expect, it, vi } from "vitest";
import { cosineSimilarity, createEmbeddings, getSemanticEmbeddingConfig, semanticContentHash } from "../minor-contracts/semantic-embeddings.js";

describe("semantic embeddings", () => {
  it("does not configure a provider implicitly", () => {
    expect(getSemanticEmbeddingConfig({})).toBeNull();
  });

  it("hashes the exact normalized text and calculates cosine similarity", () => {
    expect(semanticContentHash("servicio de limpieza")).toHaveLength(64);
    expect(cosineSimilarity([1, 0], [0.9, 0.1])).toBeCloseTo(0.99388, 4);
    expect(cosineSimilarity([1], [1, 0])).toBeNull();
  });

  it("preserves provider response order by index", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(createEmbeddings({ url: "http://127.0.0.1:11434/v1/embeddings", model: "test", provider: "local", timeoutMs: 1000 }, ["uno", "dos"]))
      .resolves.toEqual([[1, 0], [0, 1]]);
    vi.unstubAllGlobals();
  });
});
