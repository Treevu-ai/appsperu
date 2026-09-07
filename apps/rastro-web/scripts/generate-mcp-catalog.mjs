#!/usr/bin/env node
/**
 * AL3-15 — genera `src/data/mcp-tools-catalog.json` desde
 * `mcp-server/src/catalog.ts` en build-time. Reemplaza la copia manual que
 * DocsApi.tsx mantenía a mano (ver `check-mcp-tools-sync.mjs`, ahora
 * innecesario: si este script deriva SIEMPRE del archivo fuente, no puede
 * desincronizarse — solo puede tener un bug de parseo, y para eso está la
 * verificación de conteo al final).
 *
 * catalog.ts no se importa como módulo TS (evita arrastrar zod y el
 * workspace de mcp-server al build de rastro-web) — se parsea como texto.
 * Cada entrada del array `TOOL_CATALOG` tiene un formato consistente
 * (2 espacios de indentación en el nivel de la entrada, 4+ en los campos
 * anidados de `querySchema`), lo que permite partir el archivo en bloques
 * por entrada sin necesitar un parser de TS completo.
 *
 * Uso: node scripts/generate-mcp-catalog.mjs
 * Falla fuerte (exit 1) si el conteo de tools extraídos no coincide con el
 * conteo simple de `name: "..."` en el archivo — señal de que el parseo
 * por bloques se rompió con algún formato nuevo en catalog.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogPath = path.join(root, "mcp-server/src/catalog.ts");
const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/data/mcp-tools-catalog.json",
);

// catalog.ts está en CRLF (Windows) — normalizar a \n antes de cualquier
// regex multilínea, o los `\n` literales del parser nunca matchean.
const source = fs.readFileSync(catalogPath, "utf8").replace(/\r\n/g, "\n");

const sinSchedulerMatch = source.match(/const SIN_SCHEDULER\s*=\s*\n?\s*"([^"]+)"/);
const SIN_SCHEDULER_TEXT = sinSchedulerMatch ? sinSchedulerMatch[1] : null;

// Todas las ocurrencias de `name: "..."` — conteo de referencia para validar
// que el split por bloques no perdió ni duplicó ninguna entrada.
const allNames = [...source.matchAll(/^\s{4}name:\s*"([^"]+)",/gm)].map((m) => m[1]);

// Parte el archivo en un bloque de texto por cada entrada del catálogo,
// cortando justo antes de cada `  {\n    name: "..."` de nivel de entrada
// (2 espacios) y hasta el siguiente marcador del mismo tipo (o fin de array).
const entryStartRe = /\n  \{\n {4}name: "/g;
const starts = [...source.matchAll(entryStartRe)].map((m) => m.index + 1); // +1: saltar el \n inicial
const blocks = starts.map((start, i) => {
  const end = i + 1 < starts.length ? starts[i + 1] : source.indexOf("\n];", start);
  return source.slice(start, end);
});

if (blocks.length !== allNames.length) {
  console.error(
    `[generate-mcp-catalog] Split por bloques (${blocks.length}) no coincide con el conteo de "name:" (${allNames.length}).`,
  );
  process.exit(1);
}

function extractField(block, field) {
  const re = new RegExp(`\\n {4}${field}:\\s*"([^"]*)"`);
  const m = block.match(re);
  return m ? m[1] : null;
}

function extractDescription(block) {
  // Todo lo que hay entre `description:` y el siguiente `pathTemplate:` de
  // nivel de entrada — puede ser un solo string o varios concatenados con
  // `+`, terminando opcionalmente en el identificador SIN_SCHEDULER.
  const m = block.match(/\n {4}description:\s*([\s\S]*?)\n {4}pathTemplate:/);
  if (!m) return { text: "", sinScheduler: false };
  const raw = m[1];
  const parts = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((mm) => mm[1]);
  const sinScheduler = /\bSIN_SCHEDULER\b/.test(raw);
  let text = parts.join("");
  if (sinScheduler && SIN_SCHEDULER_TEXT && !text.includes(SIN_SCHEDULER_TEXT)) {
    text += SIN_SCHEDULER_TEXT;
  }
  return { text: text.trim(), sinScheduler };
}

function extractPathParams(block) {
  const m = block.match(/\n {4}pathParams:\s*\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((mm) => mm[1]);
}

function extractQueryParams(block) {
  // querySchema es siempre el último campo del ToolSpec — capturar todo lo
  // que sigue basta, sin depender de si el objeto está en una sola línea
  // (ej. `{ confidence: z.enum([...]).optional() }`) o multilínea con
  // indentación de 6 espacios. Ambos formatos aparecen en catalog.ts.
  const m = block.match(/\n {4}querySchema:\s*([\s\S]*)/);
  if (!m) return [];
  return [...m[1].matchAll(/(\w+):\s*z\./g)].map((mm) => mm[1]);
}

const tools = blocks.map((block) => {
  const name = extractField(block, "name");
  const app = extractField(block, "app");
  const pathTemplate = extractField(block, "pathTemplate");
  const { text: description, sinScheduler } = extractDescription(block);
  const pathParams = extractPathParams(block);
  const queryParams = extractQueryParams(block);
  return { name, app, description, pathTemplate, pathParams, queryParams, sinScheduler };
});

const missingFields = tools.filter((t) => !t.name || !t.app || !t.pathTemplate);
if (missingFields.length > 0) {
  console.error(
    `[generate-mcp-catalog] ${missingFields.length} entradas sin name/app/pathTemplate — parseo incompleto:`,
    missingFields.map((t) => t.name ?? "(sin nombre)"),
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(tools, null, 2)}\n`);
console.log(`[generate-mcp-catalog] OK — ${tools.length} tools generados en ${path.relative(root, outPath)}.`);

// ---------------------------------------------------------------------------
// Conteos derivados (R1 del diagnóstico de rastro.fyi, 2026-09-07): el copy
// de marketing (Home.tsx, index.html, README.md, llms.txt) tenía "10 fuentes"
// / "83 tools" escritos a mano, desincronizados del catálogo real (142 tools,
// 27 apps) desde que se agregaron apps nuevas sin tocar ese texto. Se deriva
// UNA vez aquí — misma fuente que ya usa DocsApi.tsx — para que ningún otro
// archivo vuelva a hardcodear el número.
const appCount = new Set(tools.map((t) => t.app)).size;
const counts = { appCount, toolCount: tools.length };
const countsPath = path.join(path.dirname(outPath), "catalog-counts.json");
fs.writeFileSync(countsPath, `${JSON.stringify(counts, null, 2)}\n`);
console.log(`[generate-mcp-catalog] OK — ${appCount} apps / ${tools.length} tools en ${path.relative(root, countsPath)}.`);

// Reescribe el conteo entre marcadores `<!-- COUNT:APP_COUNT -->...<!-- /COUNT -->`
// (y su equivalente TOOL_COUNT) en archivos de texto plano que no pasan por el
// bundle de Vite (README.md, public/llms.txt) — mismo principio, sin necesitar
// que esos archivos "importen" el JSON.
// Devuelve también qué claves NO tenían el marcador — un marcador ausente
// (ej. borrado sin querer al editar el archivo a mano) debe fallar el build,
// no quedar en silencio con el número viejo para siempre (mismo problema que
// esta función existe para resolver, un nivel más abajo).
// `keys` es la lista de claves que ESE archivo debe tener — no todos los
// archivos mencionan apps y tools, cada uno declara solo lo suyo para que
// "no tiene el marcador de X" siga significando "se borró por error", no
// "este archivo nunca habló de X".
function updateCountMarkers(filePath, replacements, keys) {
  let text = fs.readFileSync(filePath, "utf8");
  let changed = false;
  const missingKeys = [];
  for (const key of keys) {
    const value = replacements[key];
    const re = new RegExp(`(<!-- COUNT:${key} -->)[^<]*(<!-- /COUNT -->)`, "g");
    if (!re.test(text)) {
      missingKeys.push(key);
      continue;
    }
    re.lastIndex = 0;
    const next = text.replace(re, `$1${value}$2`);
    if (next !== text) changed = true;
    text = next;
  }
  if (changed) fs.writeFileSync(filePath, text);
  return { changed, missingKeys };
}

const markerReplacements = { APP_COUNT: appCount, TOOL_COUNT: tools.length };
const markerFiles = [
  { file: path.join(root, "apps/rastro-web/README.md"), keys: ["APP_COUNT", "TOOL_COUNT"] },
  { file: path.join(root, "apps/rastro-web/public/llms.txt"), keys: ["APP_COUNT", "TOOL_COUNT"] },
  { file: path.join(root, "apps/rastro-web/DEPLOY.md"), keys: ["TOOL_COUNT"] },
];
let anyMissingMarkers = false;
for (const { file, keys } of markerFiles) {
  if (!fs.existsSync(file)) continue;
  const { changed, missingKeys } = updateCountMarkers(file, markerReplacements, keys);
  if (changed) console.log(`[generate-mcp-catalog] Conteo actualizado en ${path.relative(root, file)}.`);
  if (missingKeys.length > 0) {
    anyMissingMarkers = true;
    console.error(`[generate-mcp-catalog] ${path.relative(root, file)} no tiene el marcador de: ${missingKeys.join(", ")}.`);
  }
}
if (anyMissingMarkers) {
  console.error(`[generate-mcp-catalog] Restaura los marcadores <!-- COUNT:CLAVE -->...<!-- /COUNT --> — sin ellos el conteo de ese archivo puede quedar desincronizado en silencio.`);
  process.exit(1);
}
