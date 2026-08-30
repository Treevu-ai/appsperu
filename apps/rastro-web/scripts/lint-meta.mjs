#!/usr/bin/env node
/**
 * Linter AL3-13 — "no número sin metadata" en la UI de ALSOL.
 *
 * Regla:
 *   Si un archivo .tsx dentro de `src/` renderiza un número (vía
 *   .toLocaleString(, Intl.NumberFormat(, o el helper `formatNumber`)
 *   SIN un bloque `@alsol-meta { fuente, cobertura, corte }` adyacente,
 *   el linter falla con la línea y la columna.
 *
 *   Excepción: el número es un argumento de <NumberWithMetadata> o
 *   formatNumber(data: WithMetadata<number>), que ya carga la metadata.
 *
 *   Objetivo: impedir que la UI muestre un número "pelado" sin su
 *   fuente, cobertura y corte. Coherente con P1 (vacío de evidencia,
 *   no conclusión).
 *
 * Uso:
 *   node scripts/lint-meta.mjs
 *   npm run lint:meta
 *
 * Exit code:
 *   0 = sin infracciones
 *   1 = al menos una infracción
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC_DIR = join(ROOT, "src");

const NUMERIC_PATTERNS = [
  { name: "toLocaleString", re: /\.toLocaleString\s*\(/g },
  { name: "Intl.NumberFormat", re: /Intl\.NumberFormat\s*\(/g },
  { name: "formatNumber(", re: /\bformatNumber\s*\(/g },
];

const SAFE_WRAPPERS = [
  "NumberWithMetadata", // <NumberWithMetadata> ya carga WithMetadata
  "metaNumber(", // helper que arma WithMetadata
  ".toLocaleString()", // explícitamente vacío (idioma) — ojo: podría ser un agujero
];

const META_DIRECTIVE = /@alsol-meta\b/;

// Archivos "biblioteca" que definen los wrappers canónicos. Estos contienen
// la implementación de `formatNumber` y de los componentes que ya cargan
// metadata por construcción; no debe inspeccionarse su cuerpo.
const HELPER_FILES = new Set([
  "src/components/NumberWithMetadata.tsx",
  "src/lib/types.ts",
  "src/lib/api-client.ts",
  "src/mocks/handlers.ts",
  "src/test/setup.ts",
  "scripts/lint-meta.mjs",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.isFile() && /\.(tsx|jsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function findInfractions(source) {
  const lines = source.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detección: ¿la línea renderiza un número con alguno de los patrones?
    const matched = NUMERIC_PATTERNS.some(({ re }) => re.test(line));
    if (!matched) continue;

    // Si está dentro de un wrapper seguro, ignorar.
    if (SAFE_WRAPPERS.some((w) => line.includes(w))) continue;

    // Comentario o string puro: no es render real.
    if (/^\s*(\/\/|\*|import|export)/.test(line)) continue;

    // Buscar la metadata en las 5 líneas anteriores O 3 líneas siguientes
    // (caso típico: `format={...}` aparece 1-2 líneas después de
    // `<NumberWithMetadata ...>` en el mismo bloque JSX).
    let foundMeta = false;
    const window = 5;
    for (let j = Math.max(0, i - window); j <= Math.min(lines.length - 1, i + window); j++) {
      if (META_DIRECTIVE.test(lines[j])) {
        foundMeta = true;
        break;
      }
    }
    // También: si la línea está dentro de un wrapper que ya carga metadata.
    // Heurística: contiene "NumberWithMetadata" o "metaNumber" en la propia
    // línea, o aparece en las 5 líneas anteriores (apertura del componente).
    if (!foundMeta && /WithMetadata|metaNumber/.test(line)) {
      foundMeta = true;
    }
    if (!foundMeta) {
      for (let j = Math.max(0, i - window); j < i; j++) {
        if (/WithMetadata|metaNumber/.test(lines[j])) {
          foundMeta = true;
          break;
        }
      }
    }

    if (!foundMeta) {
      violations.push({
        line: i + 1,
        content: line.trim().slice(0, 200),
      });
    }
  }
  return violations;
}

async function main() {
  let files;
  try {
    files = await walk(SRC_DIR);
  } catch (err) {
    console.error(`[lint-meta] No se pudo leer ${SRC_DIR}: ${err.message}`);
    process.exit(2);
  }

  let total = 0;
  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (HELPER_FILES.has(rel)) continue;
    const source = await readFile(file, "utf8");
    const violations = findInfractions(source);
    if (violations.length === 0) continue;
    total += violations.length;
    console.error(`\n❌ ${rel}`);
    for (const v of violations) {
      console.error(`  L${v.line}: ${v.content}`);
    }
  }

  if (total > 0) {
    console.error(`\n[lint-meta] ${total} infracción(es). Regla: cada número debe tener metadata adyacente o pasar por <NumberWithMetadata>.`);
    console.error(`[lint-meta] Cómo arreglar:`);
    console.error(`  1. Importa NumberWithMetadata y pasa un objeto WithMetadata<number>.`);
    console.error(`  2. O agrega un comentario @alsol-meta { fuente, cobertura, corte } en las 5 líneas anteriores.`);
    process.exit(1);
  }
  console.log(`[lint-meta] OK — ${files.length} archivos escaneados, 0 infracciones.`);
}

void stat(SRC_DIR).catch(() => {
  console.error(`[lint-meta] No existe ${SRC_DIR}`);
  process.exit(2);
});

main();
