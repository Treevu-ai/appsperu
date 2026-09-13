import { describe, expect, it } from "vitest";
import { normalizeCandidatosErm, type RawCandidatoRow } from "../ingest/normalize.js";

function row(overrides: Partial<RawCandidatoRow> = {}): RawCandidatoRow {
  return {
    dni: "47203008",
    nombre: "PAUL ANTONIO MISAEL FLORES ROBLES",
    cargo: "ALCALDE DISTRITAL",
    tipo: "MUNICIPAL DISTRITAL",
    org: "PARTIDO DEMOCRATICO SOMOS PERU",
    orgEstado: "INSCRITO",
    estado: "INSCRITO",
    ubigeo: "120103",
    departamento: "LIMA",
    provincia: "TRUJILLO",
    distrito: "LAREDO",
    posicion: 0,
    sexo: "M",
    edad: 34,
    provinciaConsejero: null,
    sentenciasDeclaradas: 0,
    ...overrides,
  };
}

describe("normalizeCandidatosErm", () => {
  it("normalizes a well-formed row end to end", () => {
    const { rows, rejected } = normalizeCandidatosErm([row()]);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dni: "47203008",
      nombreCompleto: "PAUL ANTONIO MISAEL FLORES ROBLES",
      cargo: "ALCALDE DISTRITAL",
      tipoEleccion: "MUNICIPAL DISTRITAL",
      organizacionPolitica: "PARTIDO DEMOCRATICO SOMOS PERU",
      estado: "INSCRITO",
      ubigeo: "120103",
      sexo: "M",
      edad: 34,
    });
  });

  it("rejects a dni that is not exactly 8 digits instead of truncating or padding it", () => {
    const { rows, rejected } = normalizeCandidatosErm([row({ dni: "473008" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/dni con formato inválido/);
  });

  it("rejects a tipo de elección not in the known set instead of guessing", () => {
    const { rows, rejected } = normalizeCandidatosErm([row({ tipo: "NACIONAL" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/tipo de elección/);
  });

  it("does not manufacture an ubigeo from a value that is not 6 digits", () => {
    const { rows } = normalizeCandidatosErm([row({ ubigeo: "12" })]);
    expect(rows[0].ubigeo).toBeNull();
  });

  it("does not manufacture a sexo from an unrecognized value", () => {
    const { rows } = normalizeCandidatosErm([row({ sexo: "X" })]);
    expect(rows[0].sexo).toBeNull();
  });

  it("keeps sentenciasDeclaradas as a real count, not a boolean", () => {
    const { rows } = normalizeCandidatosErm([row({ sentenciasDeclaradas: 11 })]);
    expect(rows[0].sentenciasDeclaradas).toBe(11);
  });

  it("rejects a row missing dni without touching the rest of the batch", () => {
    const { rows, rejected } = normalizeCandidatosErm([row({ dni: null }), row()]);
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("dni ausente");
  });
});
