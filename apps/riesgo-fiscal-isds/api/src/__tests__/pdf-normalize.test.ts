import { describe, expect, it } from "vitest";
import { parsePasivosContingentesTable } from "../ingest/pdf-normalize.js";

const TABLA_LIMPIA = `
Es preciso señalar que dichas cifras se actualizarán en el próximo MMM359.
2020 \t2021 \t2022 \t2023
Total \t12,70 \t12,01 \t9,92 \t10,92
1. Procesos judiciales, administrativos y arbitrajes \t8,68 \t7,08 \t6,19 \t6,59
2. Controversias internacionales en temas de inversión - CIADI \t2,01 \t3,16 \t2,15 \t2,91
3. Contingencias explícitas asumidos en contratos de APP \t2,02 \t1,78 \t1,58 \t1,42
Tipo de contingencia fiscal explícita Exposición Máxima (EM)
`;

// Formato real de MMM_2024_2027: año actual + año previo + "Contingencia
// Esperada" + "Diferencia", NO una serie de años — el parser debe descartarlo.
const TABLA_FORMATO_DISTINTO = `
2021 \t2022 \t2023 \t2022/2021
Total \t12,01 \t9,92 \t0,76 \t-2,10
1. Procesos judiciales, administrativos y arbitrajes 1, 2 \t7,08 \t6,19 \t0,67 \t-0,89
2. Controversias internacionales en temas de inversión - CIADI \t3,16 \t2,15 \t0,01 \t-1,01
3. Contingencias explícitas asumidos en contratos de APP 3 \t1,78 \t1,58 \t0,08 \t-0,20
`;

describe("parsePasivosContingentesTable", () => {
  it("parsea las 4 categorías x 4 años de una tabla en formato limpio", () => {
    const rows = parsePasivosContingentesTable(TABLA_LIMPIA);

    expect(rows).toHaveLength(16);
    expect(rows).toContainEqual({ anio: 2022, categoria: "isds", pctPbi: 2.15 });
    expect(rows).toContainEqual({ anio: 2022, categoria: "app", pctPbi: 1.58 });
    expect(rows).toContainEqual({ anio: 2023, categoria: "total", pctPbi: 10.92 });
  });

  it("devuelve 0 filas para el formato distinto de MMM_2024_2027 (año actual/previo/diferencia), en vez de datos mal ubicados", () => {
    const rows = parsePasivosContingentesTable(TABLA_FORMATO_DISTINTO);
    expect(rows).toEqual([]);
  });

  it("devuelve 0 filas si no encuentra la línea de ISDS/CIADI en absoluto", () => {
    const rows = parsePasivosContingentesTable("Un documento cualquiera sin la tabla de pasivos contingentes.");
    expect(rows).toEqual([]);
  });

  it("devuelve 0 filas si falta una de las 3 categorías (tabla incompleta)", () => {
    const tablaIncompleta = `
2020 \t2021
Total \t12,70 \t12,01
2. Controversias internacionales en temas de inversión - CIADI \t2,01 \t3,16
`;
    expect(parsePasivosContingentesTable(tablaIncompleta)).toEqual([]);
  });
});
