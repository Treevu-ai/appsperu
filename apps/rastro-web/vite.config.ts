/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// Cada app de appsperu expone su API en un puerto distinto. La UI nunca
// debe tener un valor por defecto "razonable" para una URL de backend: si
// falta, queremos que el build falle, no que la app levante apuntando a
// localhost equivocado y muestre datos fantasma.
//
// Excepción: si `VITE_PUBLIC_APIS_LIVE=false` (modo snapshot, valor por
// defecto en producción), la UI no llama a ninguna API desde el navegador
// (ver src/lib/api-config.ts) — las URLs son innecesarias y se omiten de
// .env.production para no filtrar el endpoint público de api.rastro.pe en
// el bundle. La única llamada viva es la Cloudflare Function /api/search,
// que lee las URLs desde variables de entorno del dashboard de Pages, no
// desde el bundle del cliente.
const REQUIRED_API_ENV_KEYS = [
  "VITE_API_BASE_URL_RADAR_EJECUCION",
  "VITE_API_BASE_URL_COMPRAS_PUBLICAS",
  "VITE_API_BASE_URL_RADAR_INVERSIONES",
  "VITE_API_BASE_URL_INFOBRAS",
  "VITE_API_BASE_URL_CEPLAN_ESTRATEGICO",
  "VITE_API_BASE_URL_CEPLAN_GEO",
  "VITE_API_BASE_URL_IDENTIDAD_FISCAL",
  "VITE_API_BASE_URL_SALUD_INSTITUCIONAL",
  "VITE_API_BASE_URL_PROVEEDORES_SANCIONADOS",
  "VITE_API_BASE_URL_ACTIVIDAD_AGRARIA",
  "VITE_API_BASE_URL_SEGURIDAD_CIUDADANA",
  "VITE_API_BASE_URL_BCRP_COMERCIO_EXTERIOR",
  "VITE_API_BASE_URL_INVERSION_PRIVADA",
  "VITE_API_BASE_URL_BCRP_LA_LIBERTAD",
] as const;

function apisPublishedForBuild(env: Record<string, string>): boolean {
  // Misma semántica que src/lib/api-config.ts → apisPublishedForBrowser():
  // si la flag es "false"/"0"/"no", la UI no publica APIs.
  const live = String(env.VITE_PUBLIC_APIS_LIVE ?? "").toLowerCase();
  return !(live === "false" || live === "0" || live === "no");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (apisPublishedForBuild(env) && mode !== "test") {
    const missing = REQUIRED_API_ENV_KEYS.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(
        `[rastro-web] VITE_PUBLIC_APIS_LIVE=true pero faltan variables de entorno: ${missing.join(", ")}. ` +
          `O configura las 14 URLs en .env, o pon VITE_PUBLIC_APIS_LIVE=false para modo snapshot.`,
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: false,
      host: true,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
    test: {
      environment: "node",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
      pool: "threads",
      testTimeout: 15_000,
    },
  };
});
