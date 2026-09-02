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
  const m = block.match(/\n {4}querySchema:\s*(\{[\s\S]*?\n {4}\}|\{\})/);
  if (!m) return [];
  // Solo claves de primer nivel dentro del objeto: 6 espacios de indentación.
  return [...m[1].matchAll(/\n {6}(\w+):\s*z\./g)].map((mm) => mm[1]);
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
