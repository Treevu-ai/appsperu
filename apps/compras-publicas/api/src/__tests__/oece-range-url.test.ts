import { describe, expect, it, vi } from "vitest";

vi.mock("../db/pool.js", () => ({ pool: {} }));

import { recordsPageUrl } from "../ingest/oece-records-connector.js";
import { releasesPageUrl } from "../ingest/oece-connector.js";

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
});
