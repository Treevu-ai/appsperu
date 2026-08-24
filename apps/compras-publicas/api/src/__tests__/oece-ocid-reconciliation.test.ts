import { describe, expect, it } from "vitest";
import { classifyOcidReconciliation } from "../reconciliation/oece-ocid.js";

describe("conciliación OECE por OCID", () => {
  it("only marks a case as matched when both source planes have the same OCID", () => {
    expect(classifyOcidReconciliation(true, true)).toBe("matched_exact_ocid");
  });

  it("preserves unlinked source cases instead of forcing a match", () => {
    expect(classifyOcidReconciliation(true, false)).toBe("release_only");
    expect(classifyOcidReconciliation(false, true)).toBe("record_only");
  });

  it("rejects a row with neither source plane", () => {
    expect(() => classifyOcidReconciliation(false, false)).toThrow(/al menos una fuente/);
  });
});
