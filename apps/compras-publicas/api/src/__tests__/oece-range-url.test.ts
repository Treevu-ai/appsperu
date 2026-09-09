import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {} }));
vi.mock("@appsperu/http-client", () => ({ fetchWithTimeout: vi.fn() }));

import { fetchRecordsPage, recordsPageUrl } from "../ingest/oece-records-connector.js";
import {
  fetchReleasesPage,
  OecePageNotFoundError,
  PERU_DEPARTAMENTOS,
  releasesPageUrl,
  resolveDepartamentosFromEnv,
} from "../ingest/oece-connector.js";
import { fetchWithTimeout } from "@appsperu/http-client";
import { monthlySegments } from "../ingest/oece-segments.js";

describe("OECE range ingestion URLs", () => {
  it("preserves page and explicit date window for records", () => {
    const url = new URL(recordsPageUrl(7, { startDate: "2026-01-01", endDate: "2026-08-31" }));
    expect(url.pathname).toBe("/api/v1/records");
    expect(url.searchParams.get("page")).toBe("7");
    expect(url.searchParams.get("startDate")).toBe("2026-01-01");
    expect(url.searchParams.get("endDate")).toBe("2026-08-31");
  });

  it("preserves category and date window for releases", () => {
    const url = new URL(releasesPageUrl(3, { startDate: "2026-01-01", endDate: "2026-08-31", mainProcurementCategory: "services" }));
    expect(url.pathname).toBe("/api/v1/releases");
    expect(url.searchParams.get("mainProcurementCategory")).toBe("services");
    expect(url.searchParams.get("order")).toBe("desc");
  });

  it("preserves the OECE monthly data partition in both endpoints", () => {
    expect(new URL(releasesPageUrl(1, { dataSegmentationID: "2026-01" })).searchParams.get("dataSegmentationID")).toBe("2026-01");
    expect(new URL(recordsPageUrl(1, { dataSegmentationID: "2026-08" })).searchParams.get("dataSegmentationID")).toBe("2026-08");
  });

  it("builds an inclusive, validated sequence of monthly partitions", () => {
    expect(monthlySegments("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(() => monthlySegments("2026-03", "2026-01")).toThrow("--end-segment");
  });

  it("classifies an OECE 404 as an exhausted page, not a generic source error", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchReleasesPage(501)).rejects.toEqual(expect.objectContaining({
      name: "OecePageNotFoundError", page: 501, endpoint: "/releases",
    } satisfies Partial<OecePageNotFoundError>));
    await expect(fetchRecordsPage(501)).rejects.toEqual(expect.objectContaining({
      name: "OecePageNotFoundError", page: 501, endpoint: "/records",
    } satisfies Partial<OecePageNotFoundError>));
  });
});

describe("resolveDepartamentosFromEnv (CT-08 — scripts de barrido nacional)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("lee OECE_DEPARTAMENTOS como lista separada por comas", () => {
    process.env.OECE_DEPARTAMENTOS = "LA LIBERTAD,CALLAO";
    delete process.env.OECE_DEPARTAMENTO;
    expect(resolveDepartamentosFromEnv()).toEqual(["LA LIBERTAD", "CALLAO"]);
  });

  it("cae a OECE_DEPARTAMENTO (singular) cuando no hay OECE_DEPARTAMENTOS", () => {
    delete process.env.OECE_DEPARTAMENTOS;
    process.env.OECE_DEPARTAMENTO = "CUSCO";
    expect(resolveDepartamentosFromEnv()).toEqual(["CUSCO"]);
  });

  it("devuelve undefined sin ninguna de las dos variables — el llamador decide el default", () => {
    delete process.env.OECE_DEPARTAMENTOS;
    delete process.env.OECE_DEPARTAMENTO;
    expect(resolveDepartamentosFromEnv()).toBeUndefined();
  });

  it("expone las 25 jurisdicciones para que los scripts de barrido nacional no hardcodeen una sola región", () => {
    expect(PERU_DEPARTAMENTOS).toHaveLength(25);
    expect(PERU_DEPARTAMENTOS).toContain("LA LIBERTAD");
    expect(PERU_DEPARTAMENTOS).toContain("CALLAO");
  });
});
