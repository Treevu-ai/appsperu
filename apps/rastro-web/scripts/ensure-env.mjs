import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const env = join(root, "..", ".env");
const example = join(root, "..", ".env.example");

if (!existsSync(env)) {
  if (!existsSync(example)) {
    console.error("[rastro-web] Falta .env.example");
    process.exit(1);
  }
  copyFileSync(example, env);
  console.log("[rastro-web] Creado .env desde .env.example");
}
