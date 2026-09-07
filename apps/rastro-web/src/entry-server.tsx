import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App.js";

/**
 * Entry point del build SSR (`vite build --ssr`, ver scripts/prerender.mjs).
 * No se sirve como servidor Node en producción — Cloudflare Pages es sitio
 * estático — se usa solo en build-time para congelar el DOM inicial de cada
 * ruta estática en un archivo HTML real, así un crawler que no ejecuta JS
 * (GPTBot, ClaudeBot, etc. — ver public/robots.txt) recibe contenido en vez
 * de `<div id="root"></div>` vacío. `main.tsx` sigue usando `createRoot`
 * (no `hydrateRoot`): el navegador real reemplaza este HTML congelado con el
 * render de React normal, sin necesidad de que ambos árboles coincidan byte
 * a byte.
 */
export function renderRoute(path: string): string {
  return renderToString(
    <StaticRouter location={path}>
      <App />
    </StaticRouter>,
  );
}
