import { readFileSync, writeFileSync } from "node:fs";
import { TOOL_CATALOG } from "./src/catalog.ts";
import { APP_KEYS } from "./src/apps.ts";
const byApp: Record<string, string[]> = {};
for (const t of TOOL_CATALOG) (byApp[t.app] ??= []).push(t.name);
const out: Record<string, string[]> = {};
for (const a of APP_KEYS) out[a] = (byApp[a] ?? []).sort();
const p = "src/__tests__/catalog.test.ts";
const src = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const start = src.indexOf("const EXPECTED_TOOLS_BY_APP");
const endRel = src.indexOf("\n};\n", start);
if (start < 0 || endRel < 0) throw new Error("bloque no encontrado");
const end = endRel + "\n};\n".length;
const entries = Object.entries(out)
  .map(([app, tools]) => {
    const arr = tools.length === 1 ? `["${tools[0]}"]` : `[\n${tools.map((t) => `    "${t}",`).join("\n")}\n  ]`;
    return `  "${app}": ${arr},`;
  })
  .join("\n");
writeFileSync(p, src.slice(0, start) + `const EXPECTED_TOOLS_BY_APP: Record<AppKey, string[]> = {\n${entries}\n};\n` + src.slice(end), "utf8");
console.log("apps:", Object.keys(out).length, "tools:", TOOL_CATALOG.length);
