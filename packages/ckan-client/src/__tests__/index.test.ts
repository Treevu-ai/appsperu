import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchCkanResources } from "../index.js";

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("fetchCkanResources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve los recursos cuando package_show responde con éxito y result es un objeto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ success: true, result: { resources: [{ id: "r1", name: "r1", format: "CSV", url: "https://x/r1.csv" }] } })
        )
      )
    );

    const resources = await fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" });
    expect(resources).toEqual([{ id: "r1", name: "r1", format: "CSV", url: "https://x/r1.csv" }]);
  });

  it("desenvuelve result cuando viene como array (DKAN)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ success: true, result: [{ resources: [{ id: "r1", name: "r1", format: "CSV", url: "u" }] }] })))
    );
    const resources = await fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" });
    expect(resources).toHaveLength(1);
  });

  it("envía el User-Agent explícito recibido", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ success: true, result: { resources: [] } })));
    vi.stubGlobal("fetch", fetchMock);
    await fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "mi-user-agent" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ "User-Agent": "mi-user-agent" });
  });

  it("lanza un error explícito si el status no es 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 418 } as Response)));
    await expect(fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" })).rejects.toThrow(/418/);
  });

  it("lanza un error explícito si success es false", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ success: false, result: null }))));
    await expect(fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" })).rejects.toThrow(/no tuvo éxito/);
  });

  it("lanza un error explícito si result viene vacío", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ success: true, result: [] }))));
    await expect(fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" })).rejects.toThrow(/resultado vacío/);
  });

  it("devuelve un arreglo vacío si el resultado no trae resources", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ success: true, result: {} }))));
    const resources = await fetchCkanResources({ ckanBase: "https://x", datasetSlug: "d1", userAgent: "ua" });
    expect(resources).toEqual([]);
  });
});
