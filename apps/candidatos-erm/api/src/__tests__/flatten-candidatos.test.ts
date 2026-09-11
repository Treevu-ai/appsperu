import { describe, expect, it } from "vitest";
import { flattenCandidatosJson } from "../ingest/candidatos-connector.js";

/**
 * Fixture reducido con la misma forma real verificada en vivo el 2026-09-10
 * contra `datapol.lat/articulos/erm-2026-candidatos/buscador/data/candidatos.json`:
 * `circ[tipoId][ubigeo].listas[].cands` es un array de tuplas posicionales
 * `[pos, nombre, dni, cargo, sexo, edad, provConsejero, estado, edu, sent]`.
 */
function fixture() {
  return {
    generado: "2026-09-06",
    total_candidatos: 2,
    total_listas: 1,
    cand_campos: ["pos", "nombre", "dni", "cargo", "sexo", "edad", "prov_consejero", "estado", "edu", "sent"],
    tipos: [
      { id: 4, nombre: "REGIONAL", depth: 1 },
      { id: 6, nombre: "MUNICIPAL DISTRITAL", depth: 3 },
    ],
    circ: {
      "6": {
        "120103": {
          ubi: "120103",
          dep: "LIMA",
          prov: "TRUJILLO",
          dist: "LAREDO",
          listas: [
            {
              org: "PARTIDO DEMOCRATICO SOMOS PERU",
              org_id: 1234,
              tipo_org: "PARTIDOS POLITICOS",
              estado: "INSCRITO",
              h: 1,
              m: 0,
              cabeza: {},
              cands: [
                [0, "PAUL ANTONIO MISAEL FLORES ROBLES", "47203008", "ALCALDE DISTRITAL", "M", 34, "", "INSCRITO", 27, 0],
                [1, "ALGUIEN REGIDOR", "12345678", "REGIDOR DISTRITAL", "F", 40, "", "INSCRITO", 3, 2],
              ],
            },
          ],
        },
      },
    },
  };
}

describe("flattenCandidatosJson", () => {
  it("produces one flat row per candidate tuple, with the tipo name resolved by id", () => {
    const rows = flattenCandidatosJson(fixture() as never);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      dni: "47203008",
      nombre: "PAUL ANTONIO MISAEL FLORES ROBLES",
      cargo: "ALCALDE DISTRITAL",
      tipo: "MUNICIPAL DISTRITAL",
      org: "PARTIDO DEMOCRATICO SOMOS PERU",
      ubigeo: "120103",
      departamento: "LIMA",
      provincia: "TRUJILLO",
      distrito: "LAREDO",
      posicion: 0,
      sexo: "M",
      edad: 34,
      sentenciasDeclaradas: 0,
    });
  });

  it("carries the sentencias count from the tuple's last position, not the education field next to it", () => {
    const rows = flattenCandidatosJson(fixture() as never);
    expect(rows[1].sentenciasDeclaradas).toBe(2);
  });

  it("returns an empty array for a payload with no circunscripciones", () => {
    const empty = { ...fixture(), circ: {} };
    expect(flattenCandidatosJson(empty as never)).toEqual([]);
  });
});
