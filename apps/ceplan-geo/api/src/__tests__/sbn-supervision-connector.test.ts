import { describe, expect, it, vi } from "vitest";

// parseCsv no toca la base, pero el módulo importa `pool` a nivel de módulo
// (para ingestSbnSupervision) y `db/pool.js` lanza si DATABASE_URL no está
// definida -- mockearlo evita que este test dependa de un Postgres real.
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { parseCsv } from "../ingest/sbn-supervision-connector.js";

const HEADER = "Item;Tipo de informe;N° de Informe;Fecha de Emisión;Actividad;Departamento;Provincia;Distrito;CUS;Área Supervisada (m2);Resultado de la Supervisión;Titular del Predio;Zona de Playa Protegida";

function csvOf(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseCsv (SBN supervisión de predios estatales)", () => {
  it("marca zonaPlayaProtegida=true cuando la columna booleana dice Sí (patrón 2019-2020)", () => {
    const csv = csvOf(
      "1;INFORME BRIGADA;00034-2019/SBN-DGPE-SDS;29/1/2019;SUPERVISIÓN DE PREDIOS ESTATALES;TUMBES;ZORRITOS;ZORRITOS;3186;2752.09;ACCIONES DE RECUPERACIÓN;ESTADO;Sí",
    );
    const [row] = parseCsv(csv);
    expect(row.zonaPlayaProtegida).toBe(true);
  });

  it("marca zonaPlayaProtegida=true cuando la columna booleana viene vacía pero la actividad dice PLAYA PROTEGIDA (patrón 2021-2024, hallazgo real 2026-09-22)", () => {
    const csv = csvOf(
      "1786;INFORME DE SUPERVISION;00164-2024/SBN-DGPE-SDS;31/5/2024;SUPERVISAR ZONA DE PLAYA PROTEGIDA (ZONA DE DOMINIO RESTRINGIDO);CALLAO;CALLAO;CALLAO;87502;9956.43;OCUPADO;ESTADO;",
    );
    const [row] = parseCsv(csv);
    expect(row.zonaPlayaProtegida).toBe(true);
    expect(row.actividad).toBe("SUPERVISAR ZONA DE PLAYA PROTEGIDA (ZONA DE DOMINIO RESTRINGIDO)");
  });

  it("marca zonaPlayaProtegida=false cuando ni la columna ni la actividad la mencionan", () => {
    const csv = csvOf(
      "5;INFORME BRIGADA;00050-2019/SBN-DGPE-SDS;15/3/2019;SUPERVISIÓN DE PREDIOS ESTATALES;LIMA;LIMA;ATE;1234;500.00;OCUPADO;ESTADO;No",
    );
    const [row] = parseCsv(csv);
    expect(row.zonaPlayaProtegida).toBe(false);
  });

  it("no depende de mayúsculas/minúsculas ni de tildes en la columna booleana", () => {
    const csv = csvOf(
      "1;X;A;1/1/2019;SUPERVISIÓN DE PREDIOS ESTATALES;LIMA;LIMA;ATE;1;1;OCUPADO;ESTADO;si",
    );
    const [row] = parseCsv(csv);
    expect(row.zonaPlayaProtegida).toBe(true);
  });

  it("detecta la actividad de playa protegida sin distinguir mayúsculas", () => {
    const csv = csvOf(
      "1;X;A;1/1/2024;supervisar zona de playa protegida (zona de dominio restringido);LIMA;LIMA;ATE;1;1;OCUPADO;ESTADO;",
    );
    const [row] = parseCsv(csv);
    expect(row.zonaPlayaProtegida).toBe(true);
  });

  it("parsea fecha dd/mm/yyyy a yyyy-mm-dd", () => {
    const csv = csvOf(
      "1;X;A;31/5/2024;SUPERVISIÓN DE PREDIOS ESTATALES;LIMA;LIMA;ATE;1;1;OCUPADO;ESTADO;No",
    );
    const [row] = parseCsv(csv);
    expect(row.fechaEmision).toBe("2024-05-31");
  });

  it("normaliza 'SIN CUS' a null", () => {
    const csv = csvOf(
      "1;X;A;1/1/2024;SUPERVISIÓN DE PREDIOS ESTATALES;LIMA;LIMA;ATE;SIN CUS;1;OCUPADO;ESTADO;No",
    );
    const [row] = parseCsv(csv);
    expect(row.cus).toBeNull();
  });

  it("descarta filas con menos columnas de las esperadas (estructura rota)", () => {
    const csv = csvOf("1;X;A;1/1/2024;SUPERVISIÓN;LIMA;LIMA");
    expect(parseCsv(csv)).toHaveLength(0);
  });
});
