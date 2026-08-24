import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("../db/pool.js", () => ({ pool: {} }));

import { buildLegacySeaceOrdersUrl, parseLegacySeaceOrdersWorkbook } from "../ingest/legacy-seace-orders-connector.js";

describe("SEACE legacy entity/RUC orders connector", () => {
  it("builds the public route with an explicit entity, year and month", () => {
    const url = new URL(buildLegacySeaceOrdersUrl({ ruc: "20187052221", year: 2026, month: 1 }));
    expect(url.searchParams.get("ruc_entidad")).toBe("20187052221");
    expect(url.searchParams.get("anio")).toBe("2026");
    expect(url.searchParams.get("mes")).toBe("01");
  });

  it("rejects an unsafe entity identifier or period", () => {
    expect(() => buildLegacySeaceOrdersUrl({ ruc: "invalid", year: 2026, month: 1 })).toThrow(/11 dígitos/);
    expect(() => buildLegacySeaceOrdersUrl({ ruc: "20187052221", year: 2026, month: 13 })).toThrow(/Mes inválido/);
  });

  it("parses the exported XLS without treating an empty amount as zero", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["REPORTE"],
      ["N°", "Tipo de Orden", "Número de orden", "Tipo de Contratación", "Descripción y Finalidad de la contratación", "Nro. Exp. SIAF", "Fecha de Emisión", "Fecha de Compromiso", "Estado", "Monto", "RUC", "Denominación o razón Social"],
      [1, "O/S", "001", "NAN", "Servicio de prueba", "50", "2026-01-16 00:00:00.0", "2026-01-16 00:00:00.0", "Devengada", "S/. 13,200.50", "10708484216", "Proveedor de prueba"],
      [2, "O/C", "002", "NAN", "Bien de prueba", "51", "2026-01-17 00:00:00.0", "2026-01-17 00:00:00.0", "Comprometida", "", "", ""],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Ordenes");
    const orders = parseLegacySeaceOrdersWorkbook(Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xls" })));

    expect(orders).toEqual([
      expect.objectContaining({ orderType: "O/S", orderNumber: "001", amount: 13200.5, supplierRuc: "10708484216", issueDate: "2026-01-16T00:00:00-05:00" }),
      expect.objectContaining({ orderType: "O/C", orderNumber: "002", amount: null, supplierRuc: null }),
    ]);
  });
});
