import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import counts from "../data/catalog-counts.json" with { type: "json" };
import { APP_CATALOG } from "../lib/types.js";

/**
 * Guardia contra el mismo tipo de drift que R1 cerró en esta sesión: "83
 * tools" / "104 tools" / "10 fuentes oficiales" / "14 APIs de 26"
 * hardcodeados a mano, divergiendo del catálogo real apenas alguien agrega
 * una app nueva sin tocar ese texto (pasó tres veces — Home.tsx/index.html/
 * README.md/llms.txt, Capacidades.tsx/ComoFunciona.tsx con "fuentes" en vez
 * de "tools"/"apps", y por separado el README.md de la raíz). No repite el
 * catálogo entero — solo exige que cualquier número de 2+ dígitos que
 * aparezca justo antes de "tools", "apps", "APIs" o "fuentes" en código o
 * documentación sea uno de los 3 valores legítimos hoy: el total de tools,
 * el total de apps, o el subconjunto con dashboard visual propio
 * (APP_CATALOG). Cualquier otro valor es exactamente la clase de error que
 * ya pasó tres veces.
 *
 * Números de 1 dígito quedan fuera a propósito — "2 meta-tools", "3 APIs
 * en paralelo" (Proveedor.tsx) son afirmaciones legítimas sobre cantidades
 * chicas sin relación con el catálogo total, no conteos stale.
 */
const testDir = dirname(fileURLToPath(import.meta.url));
const rastroWebRoot = resolve(testDir, "..", "..");
const repoRoot = resolve(rastroWebRoot, "..", "..");

const ALLOWED_COUNTS = new Set<number>([counts.appCount, counts.toolCount, Object.keys(APP_CATALOG).length]);

// Directorios cuyo contenido no es prosa/código citable — generado (data/),
// dependencias, build output, o tests cuyos fixtures usan números arbitrarios
// sin relación con el catálogo real.
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-ssr", "data", "__tests__", ".git"]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".txt"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

const filesToScan = [
  ...walk(join(rastroWebRoot, "src")),
  ...walk(join(rastroWebRoot, "public")),
  join(rastroWebRoot, "README.md"),
  join(rastroWebRoot, "DEPLOY.md"),
  join(rastroWebRoot, "package.json"),
  join(repoRoot, "README.md"),
];

// "fuentes" está en el vocabulario a propósito: "10 fuentes oficiales" hardcodeado
// en Capacidades.tsx/ComoFunciona.tsx fue exactamente esta misma clase de bug
// antes de R1 (con una palabra distinta a tools/apps/APIs) — sin esta palabra el
// test no lo habría detectado si vuelve a pasar.
const NUMBER_NEAR_KEYWORD = /\b(\d{2,})\s*(tools|apps|APIs|fuentes)\b/g;

describe("conteos de apps/tools hardcodeados", () => {
  it("todo número de 2+ dígitos junto a tools/apps/APIs/fuentes coincide con el catálogo real", () => {
    const offenders: string[] = [];
    for (const file of filesToScan) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(NUMBER_NEAR_KEYWORD)) {
        const value = Number(match[1]);
        if (!ALLOWED_COUNTS.has(value)) {
          offenders.push(`${file}: "${match[0]}" (permitidos: ${[...ALLOWED_COUNTS].sort((a, b) => a - b).join(", ")})`);
        }
      }
    }
    expect(offenders, `\n${offenders.join("\n")}`).toEqual([]);
  });
});
