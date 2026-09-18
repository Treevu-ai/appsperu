import { describe, expect, it } from "vitest";
import { normalizeCooperativaRow, isRejected } from "../ingest/cooperativas-normalize.js";

// Fila real observada el 2026-09-18 (busqueda_ajax.php, actividad=0, sSearch=cafe).
const REAL_ROW = [
  "20335458193",
  "COOPERATIVA DE AHORRO Y CREDITO SAN VIATOR",
  ", GERENTE: PEREZ CANDIOTTI, JAVIER, PRESIDENTE: MARIN ESCALANTE, HORMESINDA",
  "JOSE SANTOS CHOCANO  310",
  "LIMA-LIMA-COMAS",
  "2200",
  "5516670",
  "cooperativasanviator@yahoo.es                     ",
  "<a href=# onClick=popup_print(20335458193)></a>",
];

// Fila real observada el 2026-09-18 (busqueda_ajax.php, actividad=1) —
// teléfono viene como un solo espacio en blanco.
const ROW_WITHOUT_PHONE = [
  "20487272800",
  "COOPERATIVA AGRARIA CAFETALERA CAFE Y CACAO RIO NEGRO LTDA",
  ", GERENTE: TAUMA ESPINOZA, EMER EDMER, PRESIDENTE: CAYSAHUANA CAMARCO, FREDY",
  "MARGINAL S/N",
  "JUNIN-SATIPO-RIO NEGRO",
  "299",
  " ",
  "coopagrorionegro@gmail.com",
  "<a href=# onClick=popup_print(20487272800)></a>",
];

describe("normalizeCooperativaRow", () => {
  it("normaliza una fila real bien formada", () => {
    const result = normalizeCooperativaRow(REAL_ROW);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.ruc).toBe("20335458193");
    expect(result.razonSocial).toBe("COOPERATIVA DE AHORRO Y CREDITO SAN VIATOR");
    expect(result.representante).toBe("GERENTE: PEREZ CANDIOTTI, JAVIER, PRESIDENTE: MARIN ESCALANTE, HORMESINDA");
    expect(result.direccion).toBe("JOSE SANTOS CHOCANO  310");
    expect(result.ubicacionTexto).toBe("LIMA-LIMA-COMAS");
    expect(result.socios).toBe(2200);
    expect(result.telefono).toBe("5516670");
    expect(result.correo).toBe("cooperativasanviator@yahoo.es");
  });

  it("convierte un teléfono en blanco a null", () => {
    const result = normalizeCooperativaRow(ROW_WITHOUT_PHONE);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.socios).toBe(299);
    expect(result.telefono).toBeNull();
    expect(result.correo).toBe("coopagrorionegro@gmail.com");
  });

  it("convierte '-' y 'NO TIENE' a null en campos opcionales", () => {
    const row = [...REAL_ROW];
    row[3] = "-";
    row[4] = "NO TIENE";
    row[6] = "";
    const result = normalizeCooperativaRow(row);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.direccion).toBeNull();
    expect(result.ubicacionTexto).toBeNull();
    expect(result.telefono).toBeNull();
  });

  it("devuelve null en socios cuando no es un número", () => {
    const row = [...REAL_ROW];
    row[5] = "";
    const result = normalizeCooperativaRow(row);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");
    expect(result.socios).toBeNull();
  });

  it("rechaza una fila con muy pocas columnas", () => {
    const result = normalizeCooperativaRow(["20335458193", "COOPERATIVA DE AHORRO Y CREDITO SAN VIATOR"]);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/columnas/);
  });

  it("rechaza un RUC que no tiene 11 dígitos", () => {
    const row = [...REAL_ROW];
    row[0] = "123";
    const result = normalizeCooperativaRow(row);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/RUC inválido/);
  });

  it("rechaza una razón social vacía", () => {
    const row = [...REAL_ROW];
    row[1] = "";
    const result = normalizeCooperativaRow(row);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/razón social/);
  });
});
