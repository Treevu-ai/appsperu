import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TOOL_CATALOG } from "../catalog.js";
import { resolveHandler } from "../handlers/registry.js";
import { MODULOS } from "../handlers/modules.js";

/**
 * Cada `handler: "modulo:funcion"` del catálogo es una referencia por string que
 * se resuelve en runtime contra el mapa `MODULOS`. Un módulo inexistente, un
 * export renombrado o un `handler` mal formado hacen que `resolveHandler`
 * devuelva `null`, y `index.ts` lanza "No hay handler para el tool X" — el
 * síntoma es una API caída, no un cableado mal escrito. Este test usa la misma
 * ruta de resolución que producción, así que atrapa esas tres clases de error.
 *
 * Las dos guardas de estructura atacan el fallo original, que no era de mapeo
 * sino de empaque: un `import()` de ruta dinámica en `registry.ts` hace que
 * esbuild lo degrade a un glob vacío y el bundle se despliegue sin ningún
 * handler —con los 55 tools rotos y todos los tests en verde. La primera guarda
 * lo prohíbe; la segunda exige que el mapa generado esté al día y sin huérfanos.
 */
const conHandler = TOOL_CATALOG.filter((tool) => tool.handler);

describe("resolución de handlers del catálogo", () => {
  it("hay handlers declarados que verificar", () => {
    expect(conHandler.length, "ningún tool tiene handler: el guard no probaría nada").toBeGreaterThan(0);
  });

  for (const tool of conHandler) {
    it(`${tool.name} -> handlers/${tool.app}/${tool.handler}`, () => {
      const fn = resolveHandler(tool);
      expect(
        fn,
        `no se pudo resolver "${tool.handler}" en handlers/${tool.app}/; ` +
          `el formato debe ser "modulo:funcion" y ambos deben existir como export`
      ).toBeTypeOf("function");
    });
  }

  it("todos los handlers declarados tienen el formato modulo:funcion", () => {
    const malformados = conHandler.filter((t) => !/^[^:]+:[^:]+$/.test(t.handler ?? ""));
    expect(malformados.map((t) => `${t.name}: ${t.handler}`)).toEqual([]);
  });

  it("registry.ts no importa módulos con ruta dinámica", () => {
    const fuente = readFileSync(join(__dirname, "..", "handlers", "registry.ts"), "utf8");
    // El docblock del módulo cita el import dinámico que se eliminó, así que la
    // guarda mira el código sin comentarios.
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const dinamicos = [...codigo.matchAll(/import\(\s*`/g)].map((m) => m[0]);
    expect(
      dinamicos,
      "registry.ts volvió a importar módulos con ruta dinámica: esbuild la degrada a un glob que no matchea los .ts y el bundle se despliega sin handlers"
    ).toEqual([]);
  });

  it("el mapa MODULOS cubre todos los módulos con handler y no tiene huérfanos", () => {
    const modulosEnDisco = Object.keys(MODULOS);
    expect(modulosEnDisco.length, "MODULOS vacío: ejecutar node scripts/gen-handler-registry.mjs").toBeGreaterThan(0);

    const referenciados = new Set(conHandler.map((t) => `${t.app}/${t.handler.split(":")[0]}`));
    expect(modulosEnDisco.filter((m) => !referenciados.has(m)), "módulos sin ningún tool que los use").toEqual([]);
    expect([...referenciados].filter((m) => !modulosEnDisco.includes(m)), "tools sin módulo en MODULOS").toEqual([]);
  });
});
