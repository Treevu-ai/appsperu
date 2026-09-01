/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

// Cada app de appsperu expone su API en un puerto distinto. La UI nunca
// debe tener un valor por defecto "razonable" para una URL de backend: si
// falta, queremos que el build falle, no que la app levante apuntando a
// localhost equivocado y muestre datos fantasma.
const REQUIRED_ENV_KEYS = [
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length > 0 && mode !== "test") {
    throw new Error(
      `[rastro-web] Faltan variables de entorno requeridas: ${missing.join(", ")}. ` +
        `Copia .env.example a .env y completa los 14 puertos.`,
    );
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
