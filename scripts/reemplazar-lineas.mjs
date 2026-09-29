/**
 * Reemplaza un rango de líneas de un archivo. Se usa para cirugías donde el
 * `edit` no encuentra el texto exacto por finales de línea distintos.
 *
 *   node scripts/reemplazar-lineas.mjs <archivo> <desde> <hasta> <archivo-nuevo>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [archivo, desdeStr, hastaStr, destino] = process.argv.slice(2);
const desde = Number(desdeStr);
const hasta = Number(hastaStr);

const original = readFileSync(archivo, "utf8");
const eol = original.includes("\r\n") ? "\r\n" : "\n";
const lineas = original.split(/\r?\n/);

const reemplazo = readFileSync(destino, "utf8").replace(/\r?\n$/, "").split(/\r?\n/);

const salida = [...lineas.slice(0, desde - 1), ...reemplazo, ...lineas.slice(hasta)];
writeFileSync(archivo, salida.join(eol), "utf8");

console.log(`${archivo}: lineas ${desde}-${hasta} reemplazadas por ${reemplazo.length} lineas (eol=${eol === "\r\n" ? "CRLF" : "LF"})`);
