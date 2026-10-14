/**
 * Test conductual del camino que habilita los tools MCP-only en terminal.
 *
 * `invokeTool` ejecuta el handler solo si recibe `ctx.env`. En stdio, `main()`
 * resuelve ese env con `resolveStdioEnv(process.env)`: sin `NEON_DATABASE_URL`
 * no pasa nada (fallback HTTP histórico a los Express locales), con la variable
 * pasa el entorno y los tools con handler — incluidos los que NO tienen ruta
 * Express (MINCETUR/Comtrade/WDI, ver MCP_ONLY_PATHS)— corren contra Neon.
 *
 * Acá se mockea el registry de handlers para verificar las dos ramas con un tool
 * real del catálogo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invokeTool, findTool } from "../index.js";
import { executeHandler } from "../handlers/registry.js";

vi.mock("../handlers/registry.js", () => ({
  executeHandler: vi.fn(),
}));

const mockedExecute = vi.mocked(executeHandler);

beforeEach(() => {
  mockedExecute.mockReset();
});

describe("invokeTool con tools MCP-only (sin ruta Express)", () => {
  const toolName = "sunat_aduanas_comercio_bienes";

  it("con env en ctx ejecuta el handler (camino terminal/paridad Worker)", async () => {
    const tool = findTool(toolName);
    expect(tool, "el tool debe existir en el catálogo").toBeDefined();
    mockedExecute.mockResolvedValue({ status: 200, body: { ok: true } });

    const result = await invokeTool(tool!, { anio: 2024 }, { env: { NEON_DATABASE_URL: "postgres://x/y" } });
    expect(result.isError).toBe(false);
    expect(mockedExecute).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('"ok"');
  });

  it("sin env en ctx NO ejecuta el handler: cae al fallback HTTP (que para un MCP-only no existe)", async () => {
    const tool = findTool(toolName)!;
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ desdeHttp: true }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await invokeTool(tool, { anio: 2024 }, {});
    expect(mockedExecute).not.toHaveBeenCalled();
    // El fallback apuntaría al puerto local de la app: para estos tools es un
    // 404 en la práctica, y por eso existe resolveStdioEnv en main().
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/comercio-bienes");
    expect(result.isError).toBe(false);
    vi.unstubAllGlobals();
  });
});
