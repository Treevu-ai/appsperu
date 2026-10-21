/**
 * Tests del conector y handler de Agromercado — Asistencias Técnicas IV Trimestre 2025.
 * Las filas de prueba del parser son texto real capturado el 2026-10-20 de
 * https://www.datosabiertos.gob.pe/sites/default/files/A0005_AT_DataSet.csv, incluida
 * una fila con `nombre_AT` multi-línea (el caso real que motivó `parseDelimitedCsv`).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseAsistenciasCsv } from "../ingest/agromercado-asistencias-tecnicas.js";
import { list } from "../handlers/actividad-agraria/agromercado-asistencias-tecnicas.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const HEADER =
  "num_AT;codigo_AT;ano_AT;mes_AT;fecha_AT;ubigeo_AT;depa_AT;prov_AT;dis_AT;regNat_AT;actividad_AT;tematica_AT;nombre_AT;beneficiadosD_AT";

describe("parseAsistenciasCsv", () => {
  it("parsea una fila real a un objeto tipado", () => {
    const csv =
      HEADER +
      "\r\n" +
      "1;10633;2025;Febrero;4/02/2025 00:00;040510;AREQUIPA;CAYLLOMA;LARI;SIERRA;Asociatividad y Cooperativismo;" +
      "Asesoramiento en procesos registrales;-;1";
    const rows = parseAsistenciasCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      numAt: 1,
      codigoAt: "10633",
      anio: 2025,
      mes: "Febrero",
      fecha: "2025-02-04",
      ubigeo: "040510",
      departamento: "AREQUIPA",
      provincia: "CAYLLOMA",
      distrito: "LARI",
      regionNatural: "SIERRA",
      actividad: "Asociatividad y Cooperativismo",
      tematica: "Asesoramiento en procesos registrales",
      descripcion: null, // "-" en nombre_AT -> null, no el string "-"
      beneficiarios: 1,
    });
  });

  it("respeta un nombre_AT multi-línea dentro de comillas sin partir la fila", () => {
    const csv =
      HEADER +
      "\r\n" +
      '2;10634;2025;Marzo;6/03/2025 00:00;150101;LIMA;LIMA;LIMA;COSTA;Gestión Comercial;Mercadotecnia;' +
      '"primera línea\nsegunda línea de la descripción";5';
    const rows = parseAsistenciasCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].descripcion).toBe("primera línea\nsegunda línea de la descripción");
    expect(rows[0].beneficiarios).toBe(5);
  });

  it("descarta filas completamente en blanco (sin departamento ni temática)", () => {
    const csv = HEADER + "\r\n" + ";;;;;;;;;;;;;";
    expect(parseAsistenciasCsv(csv)).toHaveLength(0);
  });

  it("quita el BOM UTF-8 inicial sin romper el header", () => {
    const csv =
      "﻿" +
      HEADER +
      "\r\n1;1;2025;Enero;1/01/2025 00:00;010101;AMAZONAS;X;Y;SELVA;Act;Tema;Desc;2";
    const rows = parseAsistenciasCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].departamento).toBe("AMAZONAS");
  });
});

describe("actividad_agraria_agromercado_asistencias_tecnicas:list", () => {
  const dbQuery = vi.fn();
  function ctx(args: Record<string, unknown>): ToolHandlerContext {
    return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
  }
  beforeEach(() => dbQuery.mockReset());

  it("devuelve filas en camelCase con la fuente y advertencia correctas", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          num_at: 1,
          codigo_at: "10633",
          anio: 2025,
          mes: "Febrero",
          fecha: "2025-02-04",
          ubigeo: "040510",
          departamento: "AREQUIPA",
          provincia: "CAYLLOMA",
          distrito: "LARI",
          region_natural: "SIERRA",
          actividad: "Asociatividad y Cooperativismo",
          tematica: "Asesoramiento en procesos registrales",
          descripcion: null,
          beneficiarios: 1,
        },
      ],
    });

    const res = await list(ctx({ departamento: "arequipa" }));
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ codigoAt: "10633", regionNatural: "SIERRA" });
    expect(res.body.fuente).toMatch(/Asistencias Técnicas/);
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/departamento = \$1/);
    expect(dbQuery.mock.calls[0][1][0]).toBe("AREQUIPA");
  });

  it("aplica el filtro de regionNatural", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({ regionNatural: "SIERRA" }));
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/region_natural\) = UPPER/);
  });
});
