/**
 * Tests del conector y handler de Agromercado — Organizaciones Asistidas (mapa agregado
 * por distrito). Filas de prueba: texto real capturado el 2026-10-20 de
 * https://www.datosabiertos.gob.pe/sites/default/files/A0012_Mapa_DataSet.csv.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseOrganizacionesDistritoCsv } from "../ingest/agromercado-organizaciones-distrito.js";
import { list } from "../handlers/actividad-agraria/agromercado-organizaciones-distrito.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const HEADER = "ubigeo_mapa;depa_mapa;prov_mapa;dis_mapa;num_organaizacion_mapa";

describe("parseOrganizacionesDistritoCsv", () => {
  it("parsea filas reales a objetos tipados", () => {
    const csv = HEADER + "\r\n010114;AMAZONAS;CHACHAPOYAS;MOLINOPAMPA;1\r\n010202;AMAZONAS;BAGUA;ARAMANGO;2";
    const rows = parseOrganizacionesDistritoCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      ubigeo: "010114",
      departamento: "AMAZONAS",
      provincia: "CHACHAPOYAS",
      distrito: "MOLINOPAMPA",
      numOrganizaciones: 1,
    });
  });

  it("descarta filas sin ubigeo (clave mínima)", () => {
    const csv = HEADER + "\r\n;AMAZONAS;CHACHAPOYAS;MOLINOPAMPA;1";
    expect(parseOrganizacionesDistritoCsv(csv)).toHaveLength(0);
  });

  it("quita el BOM UTF-8 inicial", () => {
    const csv = "﻿" + HEADER + "\r\n010114;AMAZONAS;CHACHAPOYAS;MOLINOPAMPA;1";
    const rows = parseOrganizacionesDistritoCsv(csv);
    expect(rows[0].ubigeo).toBe("010114");
  });
});

describe("actividad_agraria_agromercado_organizaciones_distrito:list", () => {
  const dbQuery = vi.fn();
  function ctx(args: Record<string, unknown>): ToolHandlerContext {
    return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
  }
  beforeEach(() => dbQuery.mockReset());

  it("devuelve filas en camelCase", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [{ ubigeo: "010114", departamento: "AMAZONAS", provincia: "CHACHAPOYAS", distrito: "MOLINOPAMPA", num_organizaciones: 1 }],
    });
    const res = await list(ctx({ departamento: "amazonas" }));
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ ubigeo: "010114", numOrganizaciones: 1 });
    expect(dbQuery.mock.calls[0][1][0]).toBe("AMAZONAS");
  });
});
