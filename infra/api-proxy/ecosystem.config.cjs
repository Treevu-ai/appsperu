/**
 * PM2 — las 38 APIs de Rastro (VPS api.rastro.pe y stack local alike).
 *
 * La lista de apps vive ÚNICA vez en `apps.tsv`, al lado de este archivo.
 * Antes estaba hardcodeada acá como un array de 14 y `apps.tsv` tenía las
 * mismas 14 por separado: dos fuentes de verdad que además derivan en
 * silencio. Cuando se agregaron apps al catálogo (38 en total) nadie tocó
 * ninguna de las dos, y el resultado fue que el stack local solo levantaba
 * 14 —de las cuales 3 estaban arriba— sin ningún error que lo delatara.
 * `rastro_health` es lo que hizo visible ese hueco.
 *
 * Generar/actualizar la lista: editar `apps.tsv`.
 */
const fs = require("node:fs");
const path = require("node:path");

const WEB_ORIGIN =
  process.env.WEB_ORIGIN ??
  "https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev";
const ROOT = process.env.APPSPERU_ROOT ?? "/opt/appsperu";
// interpreter:"none" hace que PM2 haga spawn() directo del binario, sin shell.
// npm/npx son scripts .cmd en Windows, y Node no puede spawnear un .cmd sin
// shell:true (falla con EINVAL) — ni siquiera referenciando la extensión
// explícitamente. Fix: en Windows, envolver el comando en `cmd /c ...`, que sí es
// un .exe real. En Linux (VPS) esto es un no-op (usa el binario tal cual).
const IS_WIN = process.platform === "win32";

/** @type {Array<{slug:string,port:number,dir:string,cmd:string[]}>} */
function readApps() {
  const tsvPath = path.join(__dirname, "apps.tsv");
  const rows = fs
    .readFileSync(tsvPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [slug, port, dir, cmd] = line.split("\t");
      return { slug, port: Number(port), dir, cmd: (cmd ?? "").split(" ").filter(Boolean) };
    });

  // Falla al cargar el config, no en runtime con 20 apps mystery: una colisión
  // de puertos hace que dos PM2 apps peleen por el mismo socket y la que pierde
  // muere en loop de reinicio — un síntoma muy difícil de atribuir. La de
  // `riesgo-fiscal-isds`/`candidatos-erm` (ambas en 4027) duró meses por esto.
  const porPuerto = new Map();
  for (const { slug, port } of rows) {
    if (porPuerto.has(port)) {
      throw new Error(
        `apps.tsv: "${slug}" y "${porPuerto.get(port)}" comparten el puerto ${port}. ` +
          `Corrígelo en apps.tsv (y en mcp-server/src/apps.ts, que es lo que usa ` +
          `baseUrlFor para resolver la URL de cada app).`
      );
    }
    porPuerto.set(port, slug);
  }

  return rows;
}

const APPS = readApps();

module.exports = {
  apps: APPS.map(({ slug, port, dir, cmd }) => ({
    name: slug,
    cwd: `${ROOT}/apps/${dir}/api`,
    script: IS_WIN ? "cmd" : cmd[0],
    args: IS_WIN ? `/c ${cmd.join(" ")}` : cmd.slice(1).join(" "),
    interpreter: "none",
    env: {
      PORT: String(port),
      NODE_ENV: "production",
      WEB_ORIGIN,
    },
    max_restarts: 15,
    min_uptime: "10s",
    autorestart: true,
  })),
};
