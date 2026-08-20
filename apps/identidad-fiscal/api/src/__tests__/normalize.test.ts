import { describe, expect, it } from "vitest";
import { normalizeContribuyenteRow, isRejected } from "../ingest/normalize.js";

// Fila real observada el 2026-08-20 (PROYECTO ESPECIAL CHAVIMOCHIC).
const REAL_ROW = [
  "20156058719",
  "PROYECTO ESPECIAL CHAVIMOCHIC",
  "ACTIVO",
  "HABIDO",
  "130111",
  "AV.",
  "JUAN JULIO GANOZA",
  "URB.",
  "CALIFORNIA",
  "150",
  "-",
  "-",
  "-",
  "-",
  "-",
];

describe("normalizeContribuyenteRow", () => {
  it("normaliza una fila real bien formada", () => {
    const result = normalizeContribuyenteRow(REAL_ROW);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.ruc).toBe("20156058719");
    expect(result.razonSocial).toBe("PROYECTO ESPECIAL CHAVIMOCHIC");
    expect(result.estadoContribuyente).toBe("ACTIVO");
    expect(result.condicionDomicilio).toBe("HABIDO");
    expect(result.ubigeo).toBe("130111");
    expect(result.tipoVia).toBe("AV.");
    expect(result.nombreVia).toBe("JUAN JULIO GANOZA");
    expect(result.numero).toBe("150");
  });

  it("convierte '-' a null en campos opcionales, con una fila sin domicilio", () => {
    const row = [
      "10452159428",
      "GARCIA CHANCO CARLOS AUGUSTO",
      "ACTIVO",
      "HABIDO",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
      "-",
    ];
    const result = normalizeContribuyenteRow(row);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.ubigeo).toBeNull();
    expect(result.tipoVia).toBeNull();
    expect(result.numero).toBeNull();
  });

  it("rechaza una fila con muy pocas columnas", () => {
    const result = normalizeContribuyenteRow(["20156058719", "PROYECTO ESPECIAL CHAVIMOCHIC"]);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/columnas/);
  });

  it("rechaza un RUC que no tiene 11 dígitos", () => {
    const row = [...REAL_ROW];
    row[0] = "123";
    const result = normalizeContribuyenteRow(row);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/RUC inválido/);
  });

  it("rechaza una razón social vacía", () => {
    const row = [...REAL_ROW];
    row[1] = "";
    const result = normalizeContribuyenteRow(row);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/razón social/);
  });
});
