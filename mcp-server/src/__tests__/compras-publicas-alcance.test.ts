/**
 * Alcance explícito y params nuevos de los handlers MCP de compras-publicas.
 *
 * Regla que verifican: los meta-campos de la respuesta (`scope`,
 * `advertencias` en `meta`) declaran fuente/ambito/cobertura y los defaults
 * territoriales, porque un agente que infiere el alcance desde la descripción
 * del catálogo confunde "nacional" con "La Libertad". Cubre también los
 * filtros nuevos de `compras_publicas_suppliers` (categoria/anio/proveedor/top)
 * con su LEFT JOIN condicional a procurement_processes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { list as suppliersList } from "../handlers/compras-publicas/suppliers.js";
import { list as procurementList } from "../handlers/compras-publicas/procurement.js";
import { list as unsuccessfulList } from "../handlers/compras-publicas/unsuccessful-tenders.js";
import { competition, coparticipation } from "../handlers/compras-publicas/bidders.js";
import { comparativa } from "../handlers/compras-publicas/concentracion.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

const dbQuery = vi.fn();

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return { db: { query: dbQuery } as never, args, tool: {} as never, env: {} as never };
}

beforeEach(() => {
  dbQuery.mockReset();
});

describe("compras_publicas_suppliers — scope y filtros nuevos", () => {
  it("sin filtros declara alcance nacional y no emite JOIN ni LIMIT", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await suppliersList(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as { scope: Record<string, unknown> };
    expect(body.scope.ambito).toBe("nacional (sin filtro de departamento)");
    expect(String(body.scope.cobertura)).toContain("no es censo");

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql as string).not.toContain("LEFT JOIN procurement_processes");
    expect(sql as string).not.toContain("LIMIT");
    expect(params).toEqual([]);
  });

  it("aplica categoria, anio, proveedor y top en un solo SQL con JOIN calificado", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await suppliersList(
      ctx({ departamento: "la libertad", categoria: "services", anio: 2024, proveedor: "PE-RUC-1", top: 5 })
    );
    expect(res.status).toBe(200);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql as string).toContain("LEFT JOIN procurement_processes pp ON pp.ocid = awards.ocid");
    expect(sql as string).toContain("awards.departamento = $1");
    expect(sql as string).toContain("LOWER(pp.categoria) = $2");
    expect(sql as string).toContain("EXTRACT(YEAR FROM awards.fecha) = $3");
    expect(sql as string).toContain("awards.supplier_id = $4");
    expect(sql as string).toContain("LIMIT 5");
    expect(params).toEqual(["LA LIBERTAD", "services", 2024, "PE-RUC-1"]);

    const body = res.body as { scope: { ambito: string; filtros: Record<string, unknown> } };
    expect(body.scope.ambito).toBe("departamento LA LIBERTAD");
    expect(body.scope.filtros).toEqual({
      departamento: "la libertad",
      categoria: "services",
      anio: 2024,
      proveedor: "PE-RUC-1",
      top: 5,
    });
  });
});

describe("compras_publicas_procurement — scope", () => {
  it("declara fuente, ambito y cobertura (muestra OCDS con tope de 10,000)", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await procurementList(ctx({ departamento: "PIURA" }));
    expect(res.status).toBe(200);
    const body = res.body as { scope: { ambito: string; cobertura: string; filtros: { departamento: string } } };
    expect(body.scope.ambito).toBe("departamento PIURA");
    expect(body.scope.cobertura).toContain("10,000 procesos");
    expect(body.scope.filtros.departamento).toBe("PIURA");
  });
});

describe("compras_publicas_unsuccessful_tenders — scope", () => {
  it("declara ambito, exclusiones de la fuente y el tope de 500 filas", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await unsuccessfulList(ctx({ statusDetails: "DESIERTO" }));
    expect(res.status).toBe(200);
    const body = res.body as { scope: { ambito: string; cobertura: string; filtros: { statusDetails: string } } };
    expect(body.scope.ambito).toBe("nacional (sin filtro de departamento)");
    expect(body.scope.cobertura).toContain("RETROTRAIDO_POR_RESOLUCION");
    expect(body.scope.cobertura).toContain("500 filas");
    expect(body.scope.filtros.statusDetails).toBe("DESIERTO");
  });
});

describe("compras_publicas_bidders — scope de competition y coparticipation", () => {
  it("competition declara ambito nacional sin filtros", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await competition(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as { scope: { ambito: string } };
    expect(body.scope.ambito).toBe("nacional (la herramienta no filtra por departamento ni año)");
  });

  it("coparticipation declara ambito y umbral de cobertura", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await coparticipation(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as { scope: { cobertura: string } };
    expect(body.scope.cobertura).toContain("3 co-participaciones");
  });
});

describe("compras_publicas_indice_concentracion_comparativa — defaults visibles", () => {
  it("sin params advierte los defaults LA LIBERTAD y 2026", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await comparativa(ctx({}));
    expect(res.status).toBe(200);
    const meta = (res.body as { meta: { advertencias: string[] } }).meta;
    expect(meta.advertencias.some((a) => a.includes("default LA LIBERTAD"))).toBe(true);
    expect(meta.advertencias.some((a) => a.includes("default 2026"))).toBe(true);
  });

  it("con departamento y anio explícitos no advierte defaults", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await comparativa(ctx({ departamento: "LIMA,ICA", anio: 2025 }));
    expect(res.status).toBe(200);
    const meta = (res.body as { meta: { advertencias: string[] } }).meta;
    expect(meta.advertencias).toEqual([]);
  });
});
