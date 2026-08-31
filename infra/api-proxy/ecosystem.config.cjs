/**
 * PM2 — 14 APIs de Rastro en el VPS (api.rastro.pe).
 * Generar/actualizar: APPSPERU_ROOT=/opt/appsperu bash scripts/generate-pm2-ecosystem.sh
 */
const WEB_ORIGIN =
  process.env.WEB_ORIGIN ??
  "https://www.rastro.fyi,https://rastro.fyi,https://rastro-5zm.pages.dev";
const ROOT = process.env.APPSPERU_ROOT ?? "/opt/appsperu";

/** @type {Array<{slug:string,port:number,dir:string,cmd:string[]}>} */
const APPS = [
  { slug: "radar-ejecucion", port: 4000, dir: "radar-ejecucion", cmd: ["npm", "run", "start"] },
  { slug: "compras-publicas", port: 4001, dir: "compras-publicas", cmd: ["npm", "run", "start"] },
  { slug: "radar-inversiones", port: 4002, dir: "radar-inversiones", cmd: ["npx", "tsx", "src/index.ts"] },
  { slug: "infobras", port: 4003, dir: "infobras", cmd: ["npx", "tsx", "src/index.ts"] },
  { slug: "ceplan-estrategico", port: 4004, dir: "ceplan-estrategico", cmd: ["npm", "run", "start"] },
  { slug: "ceplan-geo", port: 4005, dir: "ceplan-geo", cmd: ["npm", "run", "start"] },
  { slug: "identidad-fiscal", port: 4006, dir: "identidad-fiscal", cmd: ["npx", "tsx", "src/index.ts"] },
  { slug: "salud-institucional", port: 4007, dir: "salud-institucional", cmd: ["npx", "tsx", "src/index.ts"] },
  { slug: "proveedores-sancionados", port: 4008, dir: "proveedores-sancionados", cmd: ["npx", "tsx", "src/index.ts"] },
  { slug: "actividad-agraria", port: 4009, dir: "actividad-agraria", cmd: ["npm", "run", "start"] },
  { slug: "seguridad-ciudadana", port: 4010, dir: "seguridad-ciudadana", cmd: ["npm", "run", "start"] },
  { slug: "bcrp-comercio-exterior", port: 4011, dir: "bcrp-comercio-exterior", cmd: ["npm", "run", "start"] },
  { slug: "inversion-privada", port: 4012, dir: "inversion-privada", cmd: ["npm", "run", "start"] },
  { slug: "bcrp-la-libertad", port: 4013, dir: "bcrp-la-libertad", cmd: ["npm", "run", "start"] },
];

module.exports = {
  apps: APPS.map(({ slug, port, dir, cmd }) => ({
    name: slug,
    cwd: `${ROOT}/apps/${dir}/api`,
    script: cmd[0],
    args: cmd.slice(1).join(" "),
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
