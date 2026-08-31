#!/usr/bin/env node
/**
 * Falla el build si DocsApi.tsx no lista los mismos tools que mcp-server/src/catalog.ts.
 * Evita pantalla negra en producción (un throw en runtime tumba toda la SPA).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalogPath = path.join(root, "mcp-server/src/catalog.ts");
const docsPath = path.join(root, "apps/rastro-web/src/routes/DocsApi.tsx");

function toolNamesFromCatalog(source) {
  const names = [];
  for (const match of source.matchAll(/name:\s*"([^"]+)"/g)) {
    names.push(match[1]);
  }
  return names;
}

function toolNamesFromDocsApi(source) {
  const names = [];
  for (const match of source.matchAll(/\{\s*app:\s*"[^"]+",\s*name:\s*"([^"]+)"/g)) {
    names.push(match[1]);
  }
  return names;
}

const catalog = fs.readFileSync(catalogPath, "utf8");
const docs = fs.readFileSync(docsPath, "utf8");
const catalogNames = toolNamesFromCatalog(catalog);
const docsNames = toolNamesFromDocsApi(docs);

const catalogSet = new Set(catalogNames);
const docsSet = new Set(docsNames);
const missingInDocs = catalogNames.filter((n) => !docsSet.has(n));
const extraInDocs = docsNames.filter((n) => !catalogSet.has(n));

if (missingInDocs.length === 0 && extraInDocs.length === 0 && catalogNames.length === docsNames.length) {
  console.log(`[check-mcp-tools-sync] OK — ${catalogNames.length} tools sincronizados.`);
  process.exit(0);
}

console.error("[check-mcp-tools-sync] Desincronía entre mcp-server/src/catalog.ts y DocsApi.tsx:");
if (missingInDocs.length) console.error("  Faltan en DocsApi:", missingInDocs.join(", "));
if (extraInDocs.length) console.error("  Sobran en DocsApi:", extraInDocs.join(", "));
console.error(`  catalog.ts: ${catalogNames.length} · DocsApi.tsx: ${docsNames.length}`);
process.exit(1);
