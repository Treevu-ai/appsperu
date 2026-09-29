/**
 * Compara el shape de respuesta de un handler contra el route Express de origen.
 *
 * El guard de fidelidad SQL (`mcp-server/src/__tests__/sql-fidelity.test.ts`) solo
 * verifica los literales SQL. Lo que NO cubre es el `res.json({...})` del route:
 * y ese es justamente el valor de estos tools. Un campo renombrado, perdido o
 * con null-handling distinto devuelve una respuesta distinta sin que nada falle.
 *
 * Extrae las claves de primer nivel de `res.json({` en el origen y de
 * `body: {` en el handler, y reporta las diferencias.
 *
 *   node scripts/review-response-shape.mjs <app> [modulo]
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raiz = join(here, "..");

const app = process.argv[2];
if (!app) {
  console.error("uso: node scripts/review-response-shape.mjs <app> [modulo]");
  process.exit(1);
}
const soloModulo = process.argv[3];

const dir = join(raiz, "mcp-server", "src", "handlers", app);
const routesDir = join(raiz, "apps", app, "api", "src", "routes");

/**
 * Claves de primer nivel de un objeto literal `{ a: 1, b: { ... } }`.
 *
 * Se parte el interior por las comas de nivel 0 y de cada segmento se toma el
 * identificador previo al primer `:`. El filtro de identificador descarta ruido
 * (comas sueltas, cadenas, `...spread`) y conserva los atajos `{ x }`.
 */
function clavesDePrimerNivel(bloque) {
  const interior = bloque.slice(1, -1);
  const partes = [];
  let pd = 0;
  let actual = "";
  for (const c of interior) {
    if ("{[(".includes(c)) {
      pd++;
      actual += c;
      continue;
    }
    if ("}])".includes(c)) {
      pd--;
      actual += c;
      continue;
    }
    if (c === "," && pd === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual);

  const claves = partes
    .map((s) => s.split(":")[0].trim().replace(/^\.\.\./, ""))
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  return [...new Set(claves)].sort();
}

/** Todos los `res.json({...})` y `res.status(N).json({...})` de un route. */
function bodiesDeRoute(fuente) {
  const out = [];
  const re = /res\.(?:status\(\d+\)\.)?json\(\{/g;
  let m;
  while ((m = re.exec(fuente))) {
    let i = m.index + m[0].length - 1;
    let pd = 0;
    let inicio = i;
    for (; i < fuente.length; i++) {
      const c = fuente[i];
      if (c === "{") pd++;
      else if (c === "}") {
        pd--;
        if (pd === 0) break;
      }
    }
    out.push({ bloque: fuente.slice(inicio, i + 1), pos: m.index });
  }
  return out;
}

/** Todos los `body: { ... }` de un handler. */
function bodiesDeHandler(fuente) {
  const out = [];
  const re = /body:\s*\{/g;
  let m;
  while ((m = re.exec(fuente))) {
    let i = m.index + m[0].length - 1;
    let pd = 0;
    let inicio = i;
    for (; i < fuente.length; i++) {
      const c = fuente[i];
      if (c === "{") pd++;
      else if (c === "}") {
        pd--;
        if (pd === 0) break;
      }
    }
    out.push({ bloque: fuente.slice(inicio, i + 1), pos: m.index });
  }
  return out;
}

/** Nombre de la función exportada que-envuelve una posición dada. */
function fnDePosicion(fuente, pos) {
  const antes = fuente.slice(0, pos);
  const m = [...antes.matchAll(/export async function (\w+)/g)].pop();
  return m ? m[1] : "(modulo)";
}

const modulos = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && f !== "_helpers.ts")
  .filter((f) => !soloModulo || f.replace(/\.ts$/, "") === soloModulo)
  .sort();

let comparados = 0;
let conDiferencias = 0;

for (const archivo of modulos) {
  const modulo = archivo.replace(/\.ts$/, "");
  const origen = readFileSync(join(routesDir, `${modulo}.ts`), "utf8");
  const handler = readFileSync(join(dir, archivo), "utf8");

  const delRoute = bodiesDeRoute(origen);
  const delHandler = bodiesDeHandler(handler);
  if (delRoute.length === 0 || delHandler.length === 0) continue;

  console.log(`\n=== ${app}/${modulo}: ${delRoute.length} res.json en origen, ${delHandler.length} body en handler`);
  comparados++;

  // Emparejamiento por solapamiento de claves, no posicional: los handlers
  // añaden bodies `{ error: ... }` para los 404 que el route resuelve con
  // `res.status(404).json(...)`, y eso correla las listas.
  const usadas = new Set();
  for (const r of delRoute) {
    const kR = clavesDePrimerNivel(r.bloque);
    let mejor = -1;
    let mejorScore = 0;
    for (let j = 0; j < delHandler.length; j++) {
      if (usadas.has(j)) continue;
      const kH = clavesDePrimerNivel(delHandler[j].bloque);
      const comunes = kR.filter((k) => kH.includes(k)).length;
      if (comunes > mejorScore) {
        mejorScore = comunes;
        mejor = j;
      }
    }
    const fnRoute = fnDePosicion(origen, r.pos);
    if (mejor === -1 || mejorScore === 0) {
      console.log(`  [REVISAR] ${fnRoute}: sin body equivalente en el handler (claves origen: ${kR.join(", ") || "-"})`);
      conDiferencias++;
      continue;
    }
    usadas.add(mejor);
    const h = delHandler[mejor];
    const kH = clavesDePrimerNivel(h.bloque);
    const falta = kR.filter((k) => !kH.includes(k));
    const sobra = kH.filter((k) => !kR.includes(k));
    const fnHandler = fnDePosicion(handler, h.pos);
    if (falta.length === 0 && sobra.length === 0) {
      console.log(`  [ok] ${fnRoute} / ${fnHandler} — ${kR.length} claves coinciden`);
    } else {
      conDiferencias++;
      console.log(`  [REVISAR] ${fnRoute} / ${fnHandler}`);
      if (falta.length) console.log(`      ausentes en el handler: ${falta.join(", ")}`);
      if (sobra.length) console.log(`      solo en el handler:      ${sobra.join(", ")}`);
    }
  }

  for (let j = 0; j < delHandler.length; j++) {
    if (usadas.has(j)) continue;
    const kH = clavesDePrimerNivel(delHandler[j].bloque);
    console.log(
      `  [EXTRA] body sin par en el origen (${fnDePosicion(handler, delHandler[j].pos)}): ${kH.join(", ") || "(sin claves)"}`
    );
    conDiferencias++;
  }
}

console.log(`\n${app}: ${comparados} modulos comparados, ${conDiferencias} con diferencias de shape`);
