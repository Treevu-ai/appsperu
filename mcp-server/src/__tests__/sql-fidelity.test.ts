import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { APP_KEYS } from "../apps.js";

/**
 * El valor de la migración a Neon es que el SQL de un handler sea el mismo que
 * el del route Express que reemplaza (ADR-0024). Es la única garantía de que
 * los 209 tools devuelven lo que devolvían antes: si alguien "optimiza" una
 * query al portarla, cambia una respuesta y nada se entera.
 *
 * Este test la verifica mecánicamente. Extrae los literales SQL de cada handler,
 * descarta las interpolaciones `${...}` y exige que cada trozo aparezca en el
 * route de origen.
 *
 * Qué detecta: JOIN perdidos, columnas cambiadas o reordenadas, WHERE distinto,
 * GROUP BY/ORDER BY distintos, aliases renombrados, placeholders mal numerados.
 * Qué NO detecta: que el orden de los `params.push()` no corresponda al `$n`, ni
 * cambios dentro de las interpolaciones (que se comparan en la respuesta del
 * agente, no aquí). Es una red, no una prueba de equivalencia.
 */

const REPO = join(__dirname, "..", "..", "..");
const HANDLERS_DIR = join(REPO, "mcp-server", "src", "handlers");
const APPS_DIR = join(REPO, "apps");

/** Un literal es SQL si trae un verbo y una cláusula — evita capturar prosa. */
const ES_SQL = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b[\s\S]*\b(FROM|JOIN|SET|VALUES)\b/i;

function normalizar(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Trozos literales de un template literal, sin las interpolaciones. */
function trozosLiterales(sql: string): string[] {
  return sql
    .split(/\$\{[^}]*\}/)
    .map((t) => normalizar(t))
    .filter((t) => t.length >= 25);
}

function kebab(nombre: string): string {
  return nombre.replace(/\.ts$/, "");
}

function handlersDe(app: string): string[] {
  const dir = join(HANDLERS_DIR, app);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "_helpers.ts");
}

const MARCA_PRECOMPUTADO = "@fidelity: precomputado";
const MARCA_NUEVO = "@nuevo:";

/** Cada literal SQL, con si el código justo antes de él declara `@nuevo:`. */
interface Literal {
  sql: string;
  declaradoNuevo: boolean;
}

function extraerSQL(texto: string): Literal[] {
  const fuera: Literal[] = [];
  for (const match of texto.matchAll(/`([\s\S]*?)`/g)) {
    const cuerpo = match[1];
    const indice = match.index ?? 0;
    if (!cuerpo || !ES_SQL.test(cuerpo)) continue;
    // Lo que separa esta plantilla de la anterior es imports y comentarios, así
    // que ahí puede vivir la declaración de `@nuevo:`.
    const previo = texto.slice(0, indice);
    const desdeUltimaPlantilla = Math.max(previo.lastIndexOf("`"), 0);
    fuera.push({ sql: cuerpo, declaradoNuevo: previo.slice(desdeUltimaPlantilla).includes(MARCA_NUEVO) });
  }
  return fuera;
}

/**
 * Un módulo marcado `@fidelity: precomputado` es un port deliberadamente NO
 * literal: parte de su SQL no puede existir en el route de origen porque la
 * parte cara (el matching difuso) se precomputa en una tabla y el handler solo
 * la lee.
 *
 * El marcador no abre una puerta trasera: el corpus se amplía con las
 * migraciones y el `crossref/` de la app de origen (donde vive el cálculo en
 * frío), así que cada fragmento del handler sigue teniendo que ser rastreable
 * hasta una fuente real. Las consultas que no tienen equivalente —la lectura de
 * la tabla precomputada— deben marcarse una a una con `@nuevo:` en el propio
 * handler: si alguien reintroduce el cálculo en línea, o agrega SQL sin
 * declararlo, el test lo detecta.
 *
 * Solo los módulos precomputados pueden declarar `@nuevo:`. En los demás, la
 * exigencia sigue siendo equivalencia literal.
 */
function esPrecomputado(handler: string): boolean {
  return handler.includes(MARCA_PRECOMPUTADO);
}

function recursivo(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return recursivo(p, ext);
    return e.name.endsWith(ext) ? [readFileSync(p, "utf8")] : [];
  });
}

function fuenteDeCalculo(app: string): string {
  return [
    ...recursivo(join(APPS_DIR, app, "api", "src", "db", "migrations"), ".sql"),
    ...recursivo(join(APPS_DIR, app, "api", "src", "crossref"), ".ts"),
  ].join("\n");
}

function sourceDe(app: string, modulo: string, handler: string): { texto: string; modo: string } | null {
  const dir = join(APPS_DIR, app, "api", "src", "routes");
  if (!existsSync(dir)) return null;
  const archivos = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const homonimo = archivos.find((f) => kebab(f) === modulo);
  const precomputado = esPrecomputado(handler);

  let texto: string;
  let modo: string;
  if (homonimo) {
    texto = readFileSync(join(dir, homonimo), "utf8");
    modo = "homonimo";
  } else {
    // Sin route homónimo (p. ej. un handler que agrupa varias rutas o un módulo
    // auxiliar): el SQL debe aparecer igualmente en alguna ruta de la app. Antes
    // esto se saltaba en silencio y dejaba el módulo sin verificar.
    texto = archivos.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    modo = "app-completa";
  }
  if (precomputado) {
    texto += "\n" + fuenteDeCalculo(app);
    modo += "+calculo-en-frio";
  }
  return { texto, modo };
}

describe("fidelidad de SQL: handler == route Express de origen", () => {
  let appsConHandlers = 0;

  for (const app of APP_KEYS) {
    const modulos = handlersDe(app);
    if (modulos.length === 0) continue;
    appsConHandlers++;

    for (const archivo of modulos) {
      const modulo = kebab(archivo);
      it(`${app}/${modulo}: cada literal SQL del handler es rastreable al origen`, () => {
        const handler = readFileSync(join(HANDLERS_DIR, app, archivo), "utf8");
        const encontrado = sourceDe(app, modulo, handler);
        expect(encontrado, `${app}/${modulo}: no hay routes en apps/${app}/api/src/routes`).not.toBeNull();
        if (encontrado === null) return;

        const precomputado = esPrecomputado(handler);
        if (precomputado) {
          // Se evalúa el código sin comentarios: el docblock del módulo describe
          // el cálculo en frío y menciona el matcher a propósito.
          const codigo = handler.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
          expect(
            codigo,
            `${app}/${modulo}: está marcado como precomputado pero importa o invoca el matcher difuso; el cálculo en frío debe vivir solo en apps/${app}/api/src/crossref/`
          ).not.toMatch(/@appsperu\/entity-matcher|matchEntities/);
        }

        const normalizadoOrigen = normalizar(encontrado.texto);
        const derivados = extraerSQL(handler).flatMap((lit) =>
          trozosLiterales(lit.sql).map((trozo) => ({ trozo, declaradoNuevo: lit.declaradoNuevo }))
        );
        expect(derivados.length, `${app}/${modulo}: no se encontró SQL en el handler`).toBeGreaterThan(0);

        const perdidos = derivados.filter(({ trozo, declaradoNuevo }) => {
          if (normalizadoOrigen.includes(trozo)) return false;
          return !(precomputado && declaradoNuevo);
        });
        expect(
          perdidos.map((p) => p.trozo),
          `${app}/${modulo} (${encontrado.modo}): ${perdidos.length} fragmento(s) de SQL sin equivalente en el origen. ` +
            `En un módulo "${MARCA_PRECOMPUTADO}", cada consulta intencionalmente nueva debe marcarse con "${MARCA_NUEVO}" en la línea previa.`
        ).toEqual([]);

        // Una declaración `@nuevo:` que no hace falta sería ruido que la proxima vez ocultaria
        // SQL divergente real, así que se exige que todas se usen.
        const declarados = derivados.filter((d) => d.declaradoNuevo).length;
        const necesarios = derivados.filter(({ trozo }) => !normalizadoOrigen.includes(trozo)).length;
        if (precomputado) {
          expect(declarados, `${app}/${modulo}: hay "${MARCA_NUEVO}" sin usar`).toBe(necesarios);
        } else {
          expect(declarados, `${app}/${modulo}: "${MARCA_NUEVO}" solo se permite en módulos precomputados`).toBe(0);
        }
      });
    }
  }

  it("cubrió al menos una app con handlers portados", () => {
    expect(appsConHandlers).toBeGreaterThan(0);
  });
});
