/**
 * Tests del conector y handler de Agromercado — Eventos de Articulación Comercial 2025.
 * Filas de prueba: texto real capturado el 2026-10-20 de
 * https://www.datosabiertos.gob.pe/sites/default/files/A0016_Mecanismo_DataSet.csv, incluida
 * la fila con comillas dobles escapadas en `nom_mac`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseEventosCsv } from "../ingest/agromercado-eventos-articulacion.js";
import { list } from "../handlers/actividad-agraria/agromercado-eventos-articulacion.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const HEADER = "num_mac;nom_mac;productos_mac;tipo_mac;depa_mac;fecha_mac;alcance_mercado_mac;num_organ_mac";

describe("parseEventosCsv", () => {
  it("parsea una fila real a un objeto tipado", () => {
    const csv =
      HEADER +
      "\r\n1;ARTICULACIÓN ENTRE LA ORGANIZACIÓN DE PRODUCTORES EARTH FRUIT Y LA EMPRESA AGROANDINO;MANGO;" +
      "Encuentro comercial;LAMBAYEQUE;6/1/2025;Nacional;1";
    const rows = parseEventosCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      numEvento: 1,
      nombre: "ARTICULACIÓN ENTRE LA ORGANIZACIÓN DE PRODUCTORES EARTH FRUIT Y LA EMPRESA AGROANDINO",
      productos: "MANGO",
      tipo: "Encuentro comercial",
      departamento: "LAMBAYEQUE",
      fecha: "2025-01-06",
      alcanceMercado: "Nacional",
      numOrganizaciones: 1,
    });
  });

  it("respeta comillas dobles escapadas dentro de nom_mac (caso real de la fuente)", () => {
    const csv =
      HEADER +
      '\r\n6;"CAMPAÑA YO TOMO CAFÉ PERUANO EN LA FERIA ""TRUJILLO ES LINDO DI EN EL MARCO DE 204 AÑOS""";' +
      "CAFÉ;Activación;LAMBAYEQUE;6/2/2025;Regional;0";
    const rows = parseEventosCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].nombre).toBe('CAMPAÑA YO TOMO CAFÉ PERUANO EN LA FERIA "TRUJILLO ES LINDO DI EN EL MARCO DE 204 AÑOS"');
    expect(rows[0].numOrganizaciones).toBe(0);
  });

  it("descarta filas sin nombre de evento (clave mínima)", () => {
    const csv = HEADER + "\r\n;;;;;;;";
    expect(parseEventosCsv(csv)).toHaveLength(0);
  });
});

describe("actividad_agraria_agromercado_eventos_articulacion:list", () => {
  const dbQuery = vi.fn();
  function ctx(args: Record<string, unknown>): ToolHandlerContext {
    return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
  }
  beforeEach(() => dbQuery.mockReset());

  it("devuelve filas en camelCase", async () => {
    dbQuery.mockResolvedValueOnce({
      rows: [
        {
          num_evento: 1,
          nombre: "EVENTO X",
          productos: "MANGO",
          tipo: "Encuentro comercial",
          departamento: "LAMBAYEQUE",
          fecha: "2025-01-06",
          alcance_mercado: "Nacional",
          num_organizaciones: 1,
        },
      ],
    });
    const res = await list(ctx({ tipo: "Encuentro comercial" }));
    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({ numEvento: 1, alcanceMercado: "Nacional" });
  });
});
