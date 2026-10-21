/**
 * Tests del conector y handler de Agromercado — Listado de Estudios Especializados al 2025.
 * Filas de prueba: texto real capturado el 2026-10-20 de
 * https://www.datosabiertos.gob.pe/sites/default/files/A0020_EstudiosMercado_DataSet.csv.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseEstudiosCsv } from "../ingest/agromercado-estudios-mercado.js";
import { list } from "../handlers/actividad-agraria/agromercado-estudios-mercado.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const HEADER = "num_estudio;año_estudio;mes_estudio;trim_estudio;titulo_estudio;cadena_estudio;región_estudio;uri_estudio";

describe("parseEstudiosCsv", () => {
  it("parsea una fila real a un objeto tipado", () => {
    const csv =
      HEADER +
      "\r\n1;2025;ABRIL;II;ESTUDIOS DE MERCADO;AGUAJE;LORETO, MADRE DE DIOS, UCAYALI;" +
      "https://www.gob.pe/institucion/agromercado/informes-publicaciones/7426984-perfil-de-mercado-aguaje";
    const rows = parseEstudiosCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      numEstudio: 1,
      anio: 2025,
      mes: "ABRIL",
      trimestre: "II",
      titulo: "ESTUDIOS DE MERCADO",
      cadena: "AGUAJE",
      region: "LORETO, MADRE DE DIOS, UCAYALI",
      uri: "https://www.gob.pe/institucion/agromercado/informes-publicaciones/7426984-perfil-de-mercado-aguaje",
    });
  });

  it("descarta filas sin cadena de valor (clave mínima)", () => {
    const csv = HEADER + "\r\n2;2025;MAYO;II;;;;";
    expect(parseEstudiosCsv(csv)).toHaveLength(0);
  });
});

describe("actividad_agraria_agromercado_estudios_mercado:list", () => {
  const dbQuery = vi.fn();
  function ctx(args: Record<string, unknown>): ToolHandlerContext {
    return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
  }
  beforeEach(() => dbQuery.mockReset());

  it("devuelve filas en camelCase", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          num_estudio: 1,
          anio: 2025,
          mes: "ABRIL",
          trimestre: "II",
          titulo: "ESTUDIOS DE MERCADO",
          cadena: "AGUAJE",
          region: "LORETO, MADRE DE DIOS, UCAYALI",
          uri: "https://example.com",
        },
      ],
    });
    const res = await list(ctx({ cadena: "aguaje" }));
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ numEstudio: 1, cadena: "AGUAJE" });
  });
});
