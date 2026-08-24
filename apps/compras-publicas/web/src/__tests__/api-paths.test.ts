import { afterEach, describe, expect, it, vi } from "vitest";
import { getMunicipality } from "../lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("dynamic API paths", () => {
  it("does not double-encode an already escaped municipality identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ resultados: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await getMunicipality("seace%3Aentity%3A1215");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/municipalities\/seace%3Aentity%3A1215$/);
  });
});
