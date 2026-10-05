/**
 * Genera `src/handlers/modules.ts`: el mapa estático de módulos de handler.
 *
 * Por qué existe: `resolveHandler` resolvía el módulo con un `import()`
 * dinámico (``import(`../handlers/${app}/${modulo}.js`)``). esbuild no puede
 * resolver eso y lo degrada a un glob literal sobre `../handlers/`, que no
 * matchea nada porque en el árbol de fuentes los archivos son `.ts` y no hay
 * ningún `.js`. El bundle desplegado no contenía ni un handler, así que los 55
 * tools con `handler` fallaban en runtime aunque los tests UINTA: ningún test
 * ejercitaba ese import.
 *
 * Un import estático sí lo resuelve el bundler, y además el typecheck detecta un
 * módulo o export renombrado en el momento de compilar, en vez de dejar que
 * reviente en producción.
 *
 *   node scripts/gen-handler-registry.mjs        # escribe el archivo
 *   node scripts/gen-handler-registry.mjs --check # falla si está desactualizado
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const handlersDir = join(here, "..", "src", "handlers");
const destino = join(handlersDir, "modules.ts");
const checkOnly = process.argv.includes("--check");

const apps = readdirSync(handlersDir)
  .filter((e) => statSync(join(handlersDir, e)).isDirectory())
  .sort();

const imports = [];
const entradas = [];
let total = 0;

for (const app of apps) {
  const dir = join(handlersDir, app);
  const modulos = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "_helpers.ts")
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();

  for (const modulo of modulos) {
    // Identificador único y derivable: "compras-publicas" + "minor-contracts".
    const ident = `${app}-${modulo}`.replace(/-/g, "_");
    imports.push(`import * as ${ident} from "./${app}/${modulo}.js";`);
    entradas.push(`  "${app}/${modulo}": ${ident},`);
    total++;
  }
}

const archivo = `// ARCHIVO GENERADO — no editar a mano.
// Regenerar: node scripts/gen-handler-registry.mjs
// Verificar en CI:  node scripts/gen-handler-registry.mjs --check
//
// Mapa estático de módulos de handler, indexado por "<app>/<modulo>". Cada valor
// es el namespace del módulo, de donde \`resolveHandler\` toma la función indicada
// en el campo \`handler\` del tool ("<modulo>:<funcion>"). Ver el docblock del
// script generador para por qué no puede ser un \`import()\` dinámico.
${imports.join("\n")}

export const MODULOS: Record<string, Record<string, unknown>> = {
${entradas.join("\n")}
};
`;

if (checkOnly) {
  // Normalizar finales de línea antes de comparar: un checkout en Windows deja
  // el archivo con CRLF y la plantilla se arma con \n, así que la comparación
  // byte a byte reportaba "desactualizado" con el contenido ya correcto. En CI
  // (Linux) pasaba por casualidad; en local era una falsa señal siempre.
  const normalizar = (s) => s.replace(/\r\n/g, "\n");
  const actual = existsSync(destino) ? normalizar(readFileSync(destino, "utf8")) : "";
  if (actual !== normalizar(archivo)) {
    console.error("modules.ts está desactualizado. Regenerar: node scripts/gen-handler-registry.mjs");
    process.exit(1);
  }
  console.log(`modules.ts al día (${total} módulos)`);
} else {
  writeFileSync(destino, archivo, "utf8");
  console.log(`modules.ts escrito: ${total} módulos en ${apps.length} apps`);
}
