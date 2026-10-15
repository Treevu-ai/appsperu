/**
 * `proveedores_sancionados_crossref` — el default silencioso LA LIBERTAD
 * ahora se declara en la respuesta (`advertencias`) junto con `scope`
 * (fuente/ambito/cobertura). `departamento=TODOS` no advierte.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const poolQuery = vi.fn();

vi.mock("../db/neon-env.js", () => ({
  getPoolForApp: vi.fn(() => ({ query: poolQuery })),
}));

import { list } from "../handlers/proveedores-sancionados/crossref.js";
import type { ToolHandlerContext } from "../handlers/registry.js";

function ctx(args: Record<string, unknown>): ToolHandlerContext {
  return { db: { query: vi.fn() } as never, args, tool: {} as never, env: {} as never };
}

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe("proveedores_sancionados_crossref — alcance declarado", () => {
  it("sin departamento advierte el default LA LIBERTAD y declara el ambito", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({}));
    expect(res.status).toBe(200);
    const body = res.body as {
      departamento: string;
      scope: { ambito: string; fuente: string };
      advertencias: string[];
      resultados: unknown[];
    };
    expect(body.departamento).toBe("LA LIBERTAD");
    expect(body.scope.ambito).toBe("departamento LA LIBERTAD");
    expect(body.scope.fuente).toContain("awards");
    expect(body.advertencias.some((a) => a.includes("default LA LIBERTAD") && a.includes("TODOS"))).toBe(true);
    expect(body.resultados).toEqual([]);

    // Consulta territorial por defecto (sin ámbito nacional):
    expect(poolQuery.mock.calls[0][0] as string).toContain("FROM awards WHERE departamento = $1");
    expect(poolQuery.mock.calls[0][1]).toEqual(["LA LIBERTAD"]);
  });

  it("departamento=TODOS consulta sin filtro y no advierte", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({ departamento: "TODOS" }));
    expect(res.status).toBe(200);
    const body = res.body as {
      scope: { ambito: string };
      advertencias: string[];
    };
    expect(body.scope.ambito).toBe("nacional — TODOS (awards + menores sin filtro de departamento)");
    expect(body.advertencias).toEqual([]);

    // Ambito nacional: awards sin WHERE territorial.
    expect(poolQuery.mock.calls[0][0] as string).not.toContain("WHERE departamento");
  });

  it("departamento explícito no advierte y filtra por ese departamento", async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await list(ctx({ departamento: "piura" }));
    expect(res.status).toBe(200);
    const body = res.body as { scope: { ambito: string }; advertencias: string[] };
    expect(body.scope.ambito).toBe("departamento PIURA");
    expect(body.advertencias).toEqual([]);
    expect(poolQuery.mock.calls[0][1]).toEqual(["PIURA"]);
  });
});
