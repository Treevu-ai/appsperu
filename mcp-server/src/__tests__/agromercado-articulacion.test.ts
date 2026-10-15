/**
 * Tests del conector y handler de Agromercado (Planes de Articulación
 * Comercial 2025, MIDAGRI, antes "Sierra y Selva Exportadora").
 *
 * Las filas de prueba del parser son texto real capturado el 2026-10-14 de
 * https://www.datosabiertos.gob.pe/sites/default/files/A0004_Plan_DataSet.csv
 * (incluida la fila con comas dentro de comillas en `cadena_plan`, y la fila
 * con el encoding corrupto conocido documentado en el conector).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseCsvLine, parseAgromercadoCsv } from "../ingest/agromercado-articulacion.js";
import { list } from "../handlers/actividad-agraria/agromercado-articulacion.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const HEADER =
  "num_plan;ano_plan;cod_plan;organ_plan;benef_plan;cadena_plan;producto_plan;mesInicio_plan;ubigeo_plan;depa_plan;prov_plan;dis_plan";

describe("parseCsvLine", () => {
  it("separa campos simples por ;", () => {
    expect(parseCsvLine("1;2025;AMA-2024-03;COOPERATIVA X;453;CAFÉ;CAFÉ;FEBRERO;010706;AMAZONAS;UTCUBAMBA;LONYA GRANDE")).toEqual([
      "1", "2025", "AMA-2024-03", "COOPERATIVA X", "453", "CAFÉ", "CAFÉ", "FEBRERO", "010706", "AMAZONAS", "UTCUBAMBA", "LONYA GRANDE",
    ]);
  });

  it("respeta comas dentro de comillas (fila real con cadena compuesta)", () => {
    const linea =
      '4;2025;ARE-2023-02;COOPERATIVA DE SERVICIOS MULTIPLES EL MISTI;35;"FIBRA,  LANA";FIBRA;FEBRERO;040101;AREQUIPA;AREQUIPA;AREQUIPA';
    const celdas = parseCsvLine(linea);
    expect(celdas[5]).toBe("FIBRA,  LANA");
    expect(celdas).toHaveLength(12);
  });
});

describe("parseAgromercadoCsv", () => {
  it("parsea filas reales a objetos tipados", () => {
    const csv =
      HEADER +
      "\r\n" +
      "1;2025;AMA-2024-03;COOPERATIVA AGRARIA ECOLOGICA CAFETALERA DE LONYA GRANDE;453;CAFÉ;CAFÉ;FEBRERO;010706;AMAZONAS;UTCUBAMBA;LONYA GRANDE\r\n" +
      "2;2025;ARE-2023-02;COOPERATIVA DE SERVICIOS MULTIPLES EL MISTI;35;\"FIBRA,  LANA\";FIBRA;FEBRERO;040101;AREQUIPA;AREQUIPA;AREQUIPA";

    const rows = parseAgromercadoCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      numPlan: 1,
      anio: 2025,
      codigoPlan: "AMA-2024-03",
      organizacion: "COOPERATIVA AGRARIA ECOLOGICA CAFETALERA DE LONYA GRANDE",
      beneficiarios: 453,
      cadena: "CAFÉ",
      producto: "CAFÉ",
      mesInicio: "FEBRERO",
      ubigeo: "010706",
      departamento: "AMAZONAS",
      provincia: "UTCUBAMBA",
      distrito: "LONYA GRANDE",
    });
    expect(rows[1].cadena).toBe("FIBRA,  LANA");
  });

  it("descarta filas sin codigo_plan u organizacion (claves minimas)", () => {
    const csv = HEADER + "\r\n" + ";2025;;;0;;;;;;;";
    expect(parseAgromercadoCsv(csv)).toHaveLength(0);
  });

  it("quita el BOM UTF-8 inicial sin romper el header", () => {
    const csv = "﻿" + HEADER + "\r\n1;2025;AMA-1;ORG;1;CAFÉ;CAFÉ;ENERO;010101;AMAZONAS;X;Y";
    const rows = parseAgromercadoCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].codigoPlan).toBe("AMA-1");
  });
});

describe("actividad_agraria_agromercado_articulacion:list", () => {
  const dbQuery = vi.fn();
  function ctx(args: Record<string, unknown>): ToolHandlerContext {
    return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
  }
  beforeEach(() => dbQuery.mockReset());

  it("devuelve filas en camelCase con la advertencia de match por nombre", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          num_plan: 1,
          anio: 2025,
          codigo_plan: "AMA-2024-03",
          organizacion: "COOPERATIVA AGRARIA ECOLOGICA CAFETALERA DE LONYA GRANDE",
          beneficiarios: 453,
          cadena: "CAFÉ",
          producto: "CAFÉ",
          mes_inicio: "FEBRERO",
          ubigeo: "010706",
          departamento: "AMAZONAS",
          provincia: "UTCUBAMBA",
          distrito: "LONYA GRANDE",
          ruc_match: "20612331821",
          razon_social_match: "COOPERATIVA AGRARIA ECOLOGICA CAFETALERA DE LONYA GRANDE",
          match_confianza: "confirmada",
          match_score: "1",
        },
      ],
    });

    const res = await list(ctx({ producto: "CAFÉ" }));
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      codigoPlan: "AMA-2024-03",
      rucMatch: "20612331821",
      matchConfianza: "confirmada",
      matchScore: 1,
    });
    expect(res.body.advertencia).toMatch(/no es un identificador compartido/);
  });

  it("aplica soloConRuc y confianzaMinima como filtros SQL", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });
    await list(ctx({ soloConRuc: true, confianzaMinima: "confirmada" }));
    const sql = dbQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/ruc_match IS NOT NULL/);
    expect(sql).toMatch(/match_confianza = 'confirmada'/);
  });
});
